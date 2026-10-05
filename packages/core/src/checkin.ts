/**
 * The Sunday check-in: which week it is about, and what that week came to
 * (F42, docs/formula-decisions.md; plan §2.4, A20).
 *
 * The workbook has no check-in, so nothing here has a cached value; the
 * tests are worked by hand. Everyday spending is the Variable expenses
 * list, net of refunds, as F40's habits count it, and a week is judged by
 * the Week's own Left to spend (F5), so the check-in never disagrees with
 * the Week about the same seven days. Nothing is stored: it is recomputed
 * from the ledger on every read.
 */
import { type Cents, type IsoDate, ZERO_CENTS, addDays, cents, sumCents } from '@budget/money-primitives'
import { type Change, change } from './compare.js'
import { completeMonths } from './history.js'
import { monthActuals } from './month-actuals.js'
import { usualMonth } from './notable.js'
import { type PeriodEntry, type WeekCategory, weekSheet } from './period-sheet.js'
import { byName } from './order.js'
import { coveredFrom } from './shops.js'
import { type CheckinWeek, checkinWeek } from './week.js'

export { type CheckinWeek, checkinWeek }

export interface CheckinInput {
  /** Today: the check-in is about the week ending on the latest Sunday on or before it. */
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers: a day before it was not read, and is not $0. */
  readonly readFrom: IsoDate
  /**
   * The last day the latest statement covers, as the Week's "imported up
   * to"; null or left out when no statement gives one. A day after it is
   * not all in yet, and is not $0 (e2e-setup-04).
   */
  readonly importedThrough?: IsoDate | null
  /** Every category the entries name, each with its one weekly budget (0004). */
  readonly categories: readonly WeekCategory[]
  readonly entries: readonly PeriodEntry[]
}


export interface RecapBudget {
  /** The Variable weekly budgets set, summed. */
  readonly budgetCents: Cents
  /** The Week's Left to spend (F5): below $0 when over. */
  readonly leftCents: Cents
  /** Left to spend is $0 or more. */
  readonly kept: boolean
  /** How far over, when not kept; $0 when kept. */
  readonly overCents: Cents
}

export type WeeklyRecap =
  | {
      readonly status: 'ready'
      readonly week: CheckinWeek
      /** The week's Variable spending, net; below $0 in a week of refunds. */
      readonly spentCents: Cents
      /** Null when no Variable category has a weekly budget. */
      readonly budget: RecapBudget | null
      /** The week before, when the records cover it too. */
      readonly before: { readonly spentCents: Cents; readonly change: Change } | null
      /** Days whose Variable spending is $0 or less. */
      readonly noSpendDays: number
      /** The Variable category that cost most, above $0; null when none did. */
      readonly top: { readonly categoryId: string; readonly spentCents: Cents } | null
    }
  /** The week starts before the records covered (or there are none), so its spending is unknown, not $0. */
  | { readonly status: 'not_covered'; readonly week: CheckinWeek; readonly coveredFrom: IsoDate | null }
  /** The week ends after the latest statement, so its spending is not all in yet, not $0. */
  | { readonly status: 'not_in_yet'; readonly week: CheckinWeek; readonly importedThrough: IsoDate }

export function weeklyRecap(input: CheckinInput): WeeklyRecap {
  const week = checkinWeek(input)
  const covered = coveredFrom(input)
  if (covered === null || week.start < covered) return { status: 'not_covered', week, coveredFrom: covered }
  const through = input.importedThrough
  if (through !== undefined && through !== null && week.end > through) return { status: 'not_in_yet', week, importedThrough: through }

  const byCategory = variableSpending(input, week)
  const spentCents = sumCents([...byCategory.values()])
  const budget = budgetOf(input, week)
  const beforeStart = addDays(week.start, -7)
  const beforeSpent = beforeStart < covered ? null : sumCents([...variableSpending(input, { start: beforeStart, end: addDays(week.start, -1) }).values()])

  const daily = new Map<IsoDate, Cents[]>()
  for (const e of variableRows(input, week)) daily.set(e.postedOn, [...(daily.get(e.postedOn) ?? []), cents(e.amountCents)])
  // A day's spending is the negated net of its rows (D3), so a day with only a refund spent nothing.
  const noSpendDays = Array.from({ length: 7 }, (_, i) => addDays(week.start, i)).filter((day) => sumCents(daily.get(day) ?? []) >= 0).length

  // The list's order breaks a tie, as the Month lists them.
  const ordered = input.categories.filter((c) => c.kind === 'variable').sort((a, b) => a.sortOrder - b.sortOrder || byName(a.name, b.name))
  let top: { categoryId: string; spentCents: Cents } | null = null
  for (const c of ordered) {
    const spent = byCategory.get(c.id)
    if (spent !== undefined && spent > 0 && (top === null || spent > top.spentCents)) top = { categoryId: c.id, spentCents: spent }
  }

  return {
    status: 'ready',
    week,
    spentCents,
    budget,
    before: beforeSpent === null ? null : { spentCents: beforeSpent, change: change(spentCents, beforeSpent, false) },
    noSpendDays,
    top,
  }
}

/** The window's rows on the Variable list. A row naming a category not passed in is refused, as periodSheet refuses it. */
function variableRows(input: CheckinInput, window: CheckinWeek): PeriodEntry[] {
  const kinds = new Map(input.categories.map((c) => [c.id, c.kind]))
  return input.entries.filter((e) => {
    const kind = kinds.get(e.categoryId)
    if (kind === undefined) throw new RangeError(`A ledger row names category ${e.categoryId}, which was not passed in`)
    return kind === 'variable' && e.postedOn >= window.start && e.postedOn <= window.end
  })
}

/** Each Variable category's spending in the window, net: the negated net of its rows (D3). */
function variableSpending(input: CheckinInput, window: CheckinWeek): Map<string, Cents> {
  const nets = new Map<string, Cents[]>()
  for (const e of variableRows(input, window)) nets.set(e.categoryId, [...(nets.get(e.categoryId) ?? []), cents(e.amountCents)])
  // Subtracted from zero, not negated: -0 is not the 0 a purchase and its full refund make.
  return new Map([...nets].map(([id, rows]) => [id, cents(ZERO_CENTS - sumCents(rows))]))
}

/** The Week's Left to spend on the Variable budgets (F5, as F40's streak), or null with none set. */
function budgetOf(input: CheckinInput, week: CheckinWeek): RecapBudget | null {
  const set = input.categories.flatMap((c) => (c.kind === 'variable' && c.weeklyBudgetCents !== null ? [cents(c.weeklyBudgetCents)] : []))
  if (set.length === 0) return null
  // Only the Variable block is read, which no planned bill touches.
  const sheet = weekSheet({ asOf: week.start, categories: input.categories, entries: input.entries, planHistory: [], statementPeriodEnds: [], startingBalanceCents: null })
  const leftCents = sheet.summary.leftToSpendCents
  const kept = leftCents >= 0
  return { budgetCents: sumCents(set), leftCents, kept, overCents: kept ? ZERO_CENTS : cents(ZERO_CENTS - leftCents) }
}

/** A charge the check-in asks about. */
export interface CheckinQuestion {
  readonly transactionId: string
  readonly postedOn: IsoDate
  /** What was charged, as a positive amount. */
  readonly chargeCents: Cents
  readonly categoryId: string
}

/** A charge of this much or more is worth a question; a snack is not. */
const ASK_FROM = 2_000
const QUESTIONS = 3

/**
 * F42: the check-in week's Variable charges of $20.00 or more with no
 * answer, the largest 3, a tie going to the earlier day, then the order
 * given. A refund is never asked about. Asked whether or not the records
 * cover the whole week: a question names a real row.
 */
export function questionsToAsk(input: {
  readonly asOf: IsoDate
  readonly categories: readonly WeekCategory[]
  readonly entries: readonly (PeriodEntry & { readonly id: string })[]
  /** Transactions already answered, in any week. */
  readonly answered: readonly string[]
}): { readonly week: CheckinWeek; readonly questions: readonly CheckinQuestion[] } {
  const week = checkinWeek(input)
  const answered = new Set(input.answered)
  const kinds = new Map(input.categories.map((c) => [c.id, c.kind]))
  const asked = input.entries
    .map((e, order) => ({ e, order }))
    .filter(({ e }) => kinds.get(e.categoryId) === 'variable' && e.postedOn >= week.start && e.postedOn <= week.end)
    .filter(({ e }) => cents(e.amountCents) <= -ASK_FROM && !answered.has(e.id))
    .sort((a, b) => a.e.amountCents - b.e.amountCents || (a.e.postedOn < b.e.postedOn ? -1 : a.e.postedOn > b.e.postedOn ? 1 : a.order - b.order))
    .slice(0, QUESTIONS)
  return {
    week,
    questions: asked.map(({ e }) => ({ transactionId: e.id, postedOn: e.postedOn, chargeCents: cents(-e.amountCents), categoryId: e.categoryId })),
  }
}

export type CheckinAnswer = 'planned' | 'impulse' | 'needed'

export interface ImpulseShare {
  /** The first and last of the eight weeks' Mondays. */
  readonly from: IsoDate
  readonly to: IsoDate
  readonly answers: number
  readonly impulse: number
  /** Impulse answers ÷ answers, in basis points, half-up; null with no answer. */
  readonly shareBp: number | null
}

const SHARE_WEEKS = 8

/** F42: how much of what was answered over the last eight check-in weeks was impulse. */
export function impulseShare(input: {
  readonly asOf: IsoDate
  readonly answers: readonly { readonly askedWeek: IsoDate; readonly answer: CheckinAnswer }[]
}): ImpulseShare {
  const to = checkinWeek(input).start
  const from = addDays(to, -7 * (SHARE_WEEKS - 1))
  const counted = input.answers.filter((a) => a.askedWeek >= from && a.askedWeek <= to)
  const impulse = counted.filter((a) => a.answer === 'impulse').length
  const answers = counted.length
  return { from, to, answers, impulse, shareBp: answers === 0 ? null : Math.floor((impulse * 20_000 + answers) / (2 * answers)) }
}

export interface SuggestedLimit {
  /** The recap's top category. */
  readonly categoryId: string
  readonly limitCents: Cents
  /** Which bound set it: its usual week, last week, or the weekly budget already set. */
  readonly from: 'usual' | 'last_week' | 'budget'
  readonly lastWeekCents: Cents
  /** Its usual month (F27); null with no complete month. */
  readonly usualCents: Cents | null
}

const STEP = 500n

/**
 * F42: a weekly limit for the category that cost most last week: the lower
 * of last week's Actual and its usual month × 12 ÷ 52, rounded down to $5,
 * at least $5, and never above its own weekly budget. None when the week is
 * not covered or nothing was spent.
 */
export function suggestedWeeklyLimit(input: CheckinInput): SuggestedLimit | null {
  const recap = weeklyRecap(input)
  if (recap.status !== 'ready' || recap.top === null) return null
  const { categoryId, spentCents: lastWeekCents } = recap.top
  const { months } = completeMonths(input)
  const actuals = monthActuals({ categories: input.categories, entries: input.entries, months }).months
  const usualCents = usualMonth({
    totals: actuals.map((m) => {
      const actual = m.actuals.get(categoryId)
      // monthActuals lists every category given, so this cannot miss.
      if (actual === undefined) throw new RangeError(`Category ${categoryId} is missing from the months read`)
      return { month: m.month, cents: actual }
    }),
  }).usualCents

  // Both sides over 52, so the usual week is never rounded before the two are compared.
  const lastWeek = BigInt(lastWeekCents) * 52n
  const usualWeek = usualCents === null ? null : BigInt(usualCents) * 12n
  const lower = usualWeek !== null && usualWeek < lastWeek ? usualWeek : lastWeek
  const stepped = (lower / (52n * STEP)) * STEP
  let limitCents = cents(Number(stepped < STEP ? STEP : stepped))
  let from: SuggestedLimit['from'] = lower === lastWeek ? 'last_week' : 'usual'
  const budget = input.categories.find((c) => c.id === categoryId)?.weeklyBudgetCents
  if (budget !== undefined && budget !== null && budget < limitCents) {
    limitCents = cents(budget)
    from = 'budget'
  }
  return { categoryId, limitCents, from, lastWeekCents, usualCents }
}
