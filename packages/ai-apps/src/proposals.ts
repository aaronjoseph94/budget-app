/**
 * A suggested change, from what an AI app sent to what ai_app_propose
 * stores (ADR 0013, PROPOSALS.md §2). Names become ids as list_categories
 * and get_savings_goals hand names out (cleaned), so a later rename does
 * not orphan a suggestion. Months and amounts are read here. The two
 * befores only the engine can say, a budget and a monthly amount in
 * effect for a month, are core's resolveBudgets and resolvePlans; every
 * other before the database reads itself. Either way Review works the
 * "from" out again, fresh, and never trusts a stored one.
 *
 * Pure: one owner's read in, one item or one refusal out.
 */
import { monthBounds, resolveBudgets, resolvePlans, shiftMonth, type BudgetHistoryRow, type PlanHistoryRow } from '@budget/core'
import { isoDate, type Cents, type IsoDate } from '@budget/money-primitives'
import type { Change } from '@budget/schema'
import { parseTypedAmount } from '@budget/statement-parsers'
import { cleanName } from './money.js'
import { SENTENCES } from './rpc.js'
import { budgetsFrom, categoriesFrom, goalsFrom, plansFrom, type CategoryRow, type GoalRow, type Read } from './rows.js'

/** What one propose_change reads: the owner's today, categories, budgets, monthly amounts and goals. */
export const PARTS = ['categories', 'budgets', 'plans', 'goals']

export interface Owner {
  readonly today: IsoDate
  readonly categories: readonly CategoryRow[]
  readonly budgets: readonly BudgetHistoryRow[]
  readonly plans: readonly PlanHistoryRow[]
  readonly goals: readonly GoalRow[]
}

/** The read, renamed; a part that cannot be read throws a RangeError. */
export function ownerOf(read: Read): Owner {
  return {
    today: isoDate(String(read['today'])),
    categories: categoriesFrom(read['categories']),
    budgets: budgetsFrom(read['budgets']),
    plans: plansFrom(read['plans']),
    goals: goalsFrom(read['goals']),
  }
}

/** Why one change was refused, in the words the AI app is given with it (§5). */
export const CHANGE_SENTENCES = {
  bad_change: SENTENCES.bad_change,
  unknown_category: SENTENCES.unknown_category,
  unknown_goal: 'There is no savings goal called that. Call get_savings_goals for the exact names.',
  unknown_transaction: 'There is no approved charge with that id. Call search_transactions for its id.',
  wrong_list:
    'That does not fit the category’s list: a budget or weekly limit is never on Not spending, and a monthly amount is only on Bills, Debts or Subscriptions.',
  same_as_now: 'That is already so, so there is nothing to suggest.',
  name_taken: 'The owner already has a category with that name, on one of the lists.',
  bad_month: 'The month must be this month or one of the next twelve, written like 2026-11.',
  bad_date: 'A goal’s date must be after today and before 2100.',
  bad_amount: 'An amount must be from $0.00 to $100,000.00, and a goal’s target from $0.01 to $999,999.99.',
  bad_words: 'A reason, or a new name, must be one line of visible characters: at most 300 for a reason and 60 for a name.',
  ai_row_not_learned: 'An AI app added that charge, so the app never learns its shop from it. Suggest recategorise instead.',
  dismissed_recently: 'The owner dismissed this same change in the last 14 days, so it is not suggested again yet.',
  duplicate_in_call: 'Another change in this call is for the same thing; only the first was kept.',
  too_many_waiting: '100 suggested changes already wait for the owner; list_suggestions shows them.',
  server_error: SENTENCES.server_error,
} as const

export type ChangeCode = keyof typeof CHANGE_SENTENCES
export const isChangeCode = (code: unknown): code is ChangeCode => typeof code === 'string' && Object.hasOwn(CHANGE_SENTENCES, code)

/** What ai_app_propose takes for one change, and the names it was matched by. */
export type Prepared = { readonly item: Readonly<Record<string, unknown>> } | { readonly refused: ChangeCode }

/** The most a budget, weekly limit or monthly amount may be: $100,000.00, as 0039 holds it. */
const MOST_CENTS = 10_000_000
/** The most a goal's target may be: $999,999.99, as the Savings screen takes it. */
const MOST_TARGET_CENTS = 99_999_999

/** Text as cents within [low, high]; null for none; undefined for text that is not an amount in range. */
function centsOf(text: string | null, low: number, high: number): Cents | null | undefined {
  if (text === null) return null
  const cents = parseTypedAmount(text)
  return cents !== null && cents >= low && cents <= high ? cents : undefined
}

/** 'YYYY-MM' as its first day, this month when left out; undefined outside this month and the next twelve. */
function monthOf(text: string | undefined, today: IsoDate): IsoDate | undefined {
  const first = monthBounds(today).start
  const month = text === undefined ? first : isoDate(`${text}-01`)
  return month >= first && month <= shiftMonth(first, 12) ? month : undefined
}

/** A goal's date as asked: a day after today and before 2100, or null for none; undefined otherwise. */
function goalDateOf(text: string | null, today: IsoDate): IsoDate | null | undefined {
  if (text === null) return null
  let day: IsoDate
  try {
    day = isoDate(text)
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return undefined
  }
  return day > today && day < '2100-01-01' ? day : undefined
}

const categoryNamed = (owner: Owner, name: string) => owner.categories.find((c) => cleanName(c.name) === name)

/** One budget, weekly limit, monthly amount or goal change, ready to store, or why not. */
function amountChange(owner: Owner, change: Extract<Change, { kind: 'set_budget' | 'set_weekly_limit' | 'set_bill' | 'set_goal' }>): Prepared {
  if (change.kind === 'set_goal') {
    const goal = owner.goals.find((g) => cleanName(g.name) === change.goal)
    if (goal === undefined) return { refused: 'unknown_goal' }
    const target = change.target === undefined ? undefined : centsOf(change.target, 1, MOST_TARGET_CENTS)
    if (target === undefined && change.target !== undefined) return { refused: 'bad_amount' }
    const date = change.target_date === undefined ? undefined : goalDateOf(change.target_date, owner.today)
    if (date === undefined && change.target_date !== undefined) return { refused: 'bad_date' }
    return {
      item: { kind: change.kind, goal: goal.id, ...(target === undefined ? {} : { target }), ...(change.target_date === undefined ? {} : { target_date: date }), reason: change.reason },
    }
  }
  const category = categoryNamed(owner, change.category)
  if (category === undefined) return { refused: 'unknown_category' }
  if (change.kind === 'set_weekly_limit') {
    const amount = centsOf(change.amount, 0, MOST_CENTS)
    return amount === undefined ? { refused: 'bad_amount' } : { item: { kind: change.kind, category: category.id, amount, reason: change.reason } }
  }
  const month = monthOf(change.kind === 'set_budget' ? change.month : change.from_month, owner.today)
  if (month === undefined) return { refused: 'bad_month' }
  if (change.kind === 'set_budget') {
    const amount = centsOf(change.amount, 0, MOST_CENTS)
    if (amount === undefined) return { refused: 'bad_amount' }
    const now = resolveBudgets({ asOf: month, history: owner.budgets }).budgets.find((b) => b.categoryId === category.id)
    const before = { cents: now === undefined ? null : now.budgetCents }
    return { item: { kind: change.kind, category: category.id, month, applies: change.applies, amount, before, reason: change.reason } }
  }
  const plan = resolvePlans({ asOf: month, history: owner.plans }).plans.find((p) => p.categoryId === category.id)
  const before = { cents: plan === undefined ? null : plan.plannedCents, due_day: plan === undefined ? null : plan.dueDay }
  // The part not suggested stays as it is in effect, as Setup writes both.
  const amount = change.amount === undefined ? before.cents : centsOf(change.amount, 0, MOST_CENTS)
  if (amount === undefined) return { refused: 'bad_amount' }
  const dueDay = change.due_day === undefined ? before.due_day : change.due_day
  return { item: { kind: change.kind, category: category.id, month, amount, due_day: dueDay, before, reason: change.reason } }
}

/** One change as ai_app_propose takes it, or why it was refused here. */
export function prepare(owner: Owner, change: Change): Prepared {
  switch (change.kind) {
    case 'set_budget':
    case 'set_weekly_limit':
    case 'set_bill':
    case 'set_goal':
      return amountChange(owner, change)
    default:
      return { refused: 'bad_change' }
  }
}
