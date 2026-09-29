/**
 * Ask about your money: the answers about what was spent (F48,
 * docs/formula-decisions.md; plan slice A24): how much, against the time
 * before, where it went, at which shops, the month explained, and what is
 * left of a budget.
 *
 * Every figure an answer shows is worked out here or by the engine
 * functions it calls, never by the screen and never by the AI, which only
 * read the question. A window is counted a month at a time through
 * periodSheet, each part with its own month's planned amounts, so a bill
 * counts on its due day (F8) as the Month's comparison strip counts it.
 *
 * NOT workbook-derived. The tests are worked by hand.
 */
import { type Cents, type IsoDate, addCents, addDays, cents, sumCents } from '@budget/money-primitives'
import type { BudgetHistoryRow } from './budgets.js'
import { type DateWindow, change } from './compare.js'
import type { Figure } from './digest.js'
import type { PlanHistoryRow } from './plans.js'
import { type PeriodRow, type PeriodSheet, type WeekCategory, monthSheet, periodSheet, plansInEffect, weekSheet } from './period-sheet.js'
import { type ShopEntry, shopRows } from './shops.js'
import { SPENDING_LISTS, monthBounds } from './week.js'

/** Which of the app's sentences an answer line is said in (savings-coach's ANSWER_WORDS). */
export type AnswerSay =
  | 'spent_in' | 'received_in' | 'saved_in' | 'spent_all'
  | 'compared' | 'compared_all' | 'compared_same' | 'compared_all_same' | 'not_compared'
  | 'top_categories' | 'top_shops' | 'nothing_spent' | 'no_shops' | 'row'
  | 'month'
  | 'left' | 'over' | 'no_budget' | 'left_all' | 'over_all'
  | 'subscriptions' | 'subscription' | 'no_subscriptions'
  | 'forecast_range' | 'forecast_rough' | 'too_early' | 'no_start'
  | 'safe' | 'nothing_left'
  | 'goal_range' | 'goal_range_open' | 'goal_rough' | 'goal_met' | 'goal_no_fund' | 'goal_no_pace' | 'goal_too_early' | 'goal_no_records' | 'no_goals'
  | 'what_if_sooner' | 'what_if_alone' | 'what_if_met' | 'no_saving' | 'goal'
  | 'debt_free' | 'no_debts' | 'never_paid_off'

/** One line of an answer: its sentence, whom it is about and its figures, by slot. */
export interface AnswerLine {
  readonly say: AnswerSay
  /** The categories, shop or goal it is about, by name; empty for all of the spending. */
  readonly names: readonly string[]
  readonly figures: Readonly<Record<string, Figure>>
}

/** An answer's main line, and the list under it. */
export interface Lines {
  readonly main: AnswerLine
  readonly rows: readonly AnswerLine[]
}

export type Answer =
  | {
      readonly status: 'answered'
      /** The days counted, where the answer is about a stretch of days. */
      readonly now: DateWindow | null
      /** The days compared with, for a comparison that has them. */
      readonly before: DateWindow | null
      /** The first day counted when the records begin inside the period asked about. */
      readonly cutFrom: IsoDate | null
      readonly main: AnswerLine
      /** A list under it: the top three, the other goals, the dearest charges. */
      readonly rows: readonly AnswerLine[]
    }
  /** A month by its name still to come. */
  | { readonly status: 'not_yet' }
  | { readonly status: 'before_records'; readonly coveredFrom: IsoDate | null }
  /** The figures it needs did not load (the forecast's reads, or the debts). */
  | { readonly status: 'missing'; readonly what: 'forecast' | 'debts' }

/** What every answer about spending reads. */
export interface SpendingBase {
  readonly asOf: IsoDate
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers. */
  readonly readFrom: IsoDate
  readonly categories: readonly WeekCategory[]
  readonly budgetHistory: readonly BudgetHistoryRow[]
  readonly planHistory: readonly PlanHistoryRow[]
  readonly entries: readonly ShopEntry[]
}

const cents$ = (value: Cents): Figure => ({ unit: 'cents', value })
const SPENDING = new Set(SPENDING_LISTS)

/** Every category's Actual over the window, a month at a time, and Spent (F7) over all of it. */
function counted(base: SpendingBase, window: DateWindow): { readonly spent: Cents; readonly actual: ReadonlyMap<string, Cents> } {
  const actual = new Map<string, Cents>()
  const spent: Cents[] = []
  for (let from = window.from; from <= window.to; from = addDays(monthBounds(from).end, 1)) {
    const end = monthBounds(from).end
    const sheet = periodSheet({
      from,
      to: end < window.to ? end : window.to,
      categories: base.categories,
      budgets: [],
      plans: plansInEffect(base.categories, base.planHistory, from),
      entries: base.entries,
      statementPeriodEnds: [],
      startingBalanceCents: null,
    })
    spent.push(sheet.summary.spentCents)
    for (const row of rowsOf(sheet)) {
      const was = actual.get(row.categoryId)
      actual.set(row.categoryId, was === undefined ? row.actualCents : addCents(was, row.actualCents))
    }
  }
  return { spent: sumCents(spent), actual }
}

function rowsOf(sheet: PeriodSheet): readonly PeriodRow[] {
  const { income, savings, bill, debt, subscription, variable } = sheet.blocks
  return [income, savings, bill, debt, subscription, variable].flatMap((b) => b.rows)
}

type Group = 'income' | 'savings' | 'spending'
const groupOf = (kind: WeekCategory['kind']): Group | null => (kind === 'income' || kind === 'savings' ? kind : SPENDING.has(kind) ? 'spending' : null)

/**
 * The categories asked about that can be added together: those in the
 * first one's group (spending, income or savings), in the order asked.
 * Money in is never added to money out. Not spending has no figure.
 */
function asked(base: SpendingBase, ids: readonly string[]): { readonly group: Group; readonly picked: readonly WeekCategory[] } | null {
  const found = ids.map((id) => base.categories.find((c) => c.id === id) ?? unknown(id))
  const first = found.map((c) => groupOf(c.kind)).find((g) => g !== null)
  if (first === undefined) return null
  return { group: first, picked: found.filter((c) => groupOf(c.kind) === first) }
}

function unknown(id: string): never {
  throw new RangeError(`A question names category ${id}, which was not passed in`)
}

function total(actual: ReadonlyMap<string, Cents>, picked: readonly WeekCategory[]): Cents {
  // Every category passed in has a row in each part of the window, so each is there.
  return sumCents(picked.map((c) => actual.get(c.id) ?? unknown(c.id)))
}

/** How much went on the categories asked about, or on all spending, and how to say it. */
function amountIn(base: SpendingBase, window: DateWindow, ids: readonly string[]): { readonly say: AnswerSay; readonly names: readonly string[]; readonly amount: Cents } {
  const { spent, actual } = counted(base, window)
  const chosen = asked(base, ids)
  if (chosen === null) return { say: 'spent_all', names: [], amount: spent }
  const say = chosen.group === 'income' ? 'received_in' : chosen.group === 'savings' ? 'saved_in' : 'spent_in'
  return { say, names: chosen.picked.map((c) => c.name), amount: total(actual, chosen.picked) }
}

/** How much went on the categories asked about, or on all spending (F48). */
export function spendIn(base: SpendingBase, window: DateWindow, ids: readonly string[]): AnswerLine {
  const { say, names, amount } = amountIn(base, window, ids)
  return { say, names, figures: { amount: cents$(amount) } }
}

/** The same against the days before (F25, F26); with none inside the records, the days asked about alone. */
export function compareIn(base: SpendingBase, now: DateWindow, before: DateWindow | null, ids: readonly string[]): AnswerLine {
  const alone = amountIn(base, now, ids)
  if (before === null) return { say: 'not_compared', names: alone.names, figures: { amount: cents$(alone.amount) } }
  const earlier = amountIn(base, before, ids)
  const moved = change(alone.amount, earlier.amount, alone.say === 'received_in' || alone.say === 'saved_in')
  // Under $1.00 either way is the same (F26), which a sentence says as "the same as", never "the same than".
  const same = moved.direction === 'same'
  return {
    say: alone.names.length === 0 ? (same ? 'compared_all_same' : 'compared_all') : same ? 'compared_same' : 'compared',
    names: alone.names,
    figures: { now: cents$(alone.amount), before: cents$(earlier.amount), change: { unit: 'change', value: moved.changeCents, direction: moved.direction } },
  }
}

const TOP = 3
const byAmountThenName = (a: { amount: Cents; name: string }, b: { amount: Cents; name: string }) => b.amount - a.amount || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

function topLines(ranked: readonly { readonly amount: Cents; readonly name: string }[], say: AnswerSay, none: AnswerSay): Lines {
  const rows = ranked.slice(0, TOP).map((r): AnswerLine => ({ say: 'row', names: [r.name], figures: { amount: cents$(r.amount) } }))
  const [first] = rows
  return { main: first === undefined ? { say: none, names: [], figures: {} } : { ...first, say }, rows }
}

/** The spending categories with the most spent, above $0, at most three. */
export function topCategories(base: SpendingBase, window: DateWindow): Lines {
  const { actual } = counted(base, window)
  const ranked = base.categories
    .filter((c) => SPENDING.has(c.kind))
    .map((c) => ({ name: c.name, amount: actual.get(c.id) ?? unknown(c.id) }))
    .filter((r) => r.amount > 0)
    .sort(byAmountThenName)
  return topLines(ranked, 'top_categories', 'nothing_spent')
}

/** The shops with the most spent, net of refunds (F41's rows), above $0, at most three. */
export function topShopsIn(base: SpendingBase, window: DateWindow): Lines {
  const net = new Map<string, Cents>()
  for (const r of shopRows(base)) {
    if (r.postedOn < window.from || r.postedOn > window.to) continue
    const was = net.get(r.shop)
    const amount = cents(-r.amountCents)
    net.set(r.shop, was === undefined ? amount : addCents(was, amount))
  }
  const ranked = [...net].map(([name, amount]) => ({ name, amount })).filter((r) => r.amount > 0).sort(byAmountThenName)
  return topLines(ranked, 'top_shops', 'no_shops')
}

/** The Month's own sheet explained (F48): Income, Spent and Saved as the Month shows them, and its three largest Variable expenses. */
export function explainMonth(base: SpendingBase, month: IsoDate): Lines {
  const sheet = monthSheet({ ...base, asOf: month, statementPeriodEnds: [], startingBalanceCents: null })
  const { incomeCents, spentCents, savedCents } = sheet.summary
  const ranked = sheet.blocks.variable.rows.map((r) => ({ name: r.name, amount: r.actualCents })).filter((r) => r.amount > 0).sort(byAmountThenName)
  return {
    main: {
      say: 'month',
      names: [],
      figures: { month: { unit: 'month', value: monthBounds(month).start }, income: cents$(incomeCents), spent: cents$(spentCents), saved: cents$(savedCents) },
    },
    rows: topLines(ranked, 'row', 'row').rows,
  }
}

/** What is left of a budget: the Month's Left (F5) this month, or the Week's this week. */
export function budgetLeft(base: SpendingBase, week: boolean, ids: readonly string[]): Lines {
  const common = { ...base, statementPeriodEnds: [], startingBalanceCents: null }
  const sheet = week ? weekSheet(common) : monthSheet(common)
  const leftOf = (remaining: Cents | null, names: readonly string[], all: boolean): AnswerLine => {
    if (remaining === null) return { say: 'no_budget', names, figures: {} }
    if (remaining < 0) return { say: all ? 'over_all' : 'over', names, figures: { over: cents$(cents(-remaining)) } }
    return { say: all ? 'left_all' : 'left', names, figures: { left: cents$(remaining) } }
  }
  const spending = new Map(rowsOf(sheet).map((r) => [r.categoryId, r]))
  const lines = ids.flatMap((id) => {
    const row = spending.get(id)
    const category = base.categories.find((c) => c.id === id) ?? unknown(id)
    // Only spending has a Left; a question about pay or savings has none to give. A row
    // with no budget has none either, though the workbook reads its Left against $0. A
    // bill's plan standing as its budget (F51) is one, so the answer agrees with the Month.
    if (row === undefined || !SPENDING.has(category.kind)) return []
    return [leftOf(row.effectiveBudgetCents === null ? null : row.remainingCents, [row.name], false)]
  })
  const [main, ...rows] = lines
  if (main === undefined) return { main: leftOf(sheet.blocks.variable.remainingTotalCents, [], true), rows: [] }
  return { main, rows }
}
