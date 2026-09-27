/**
 * Starter budgets: each spending category's usual month, offered once (F43,
 * docs/formula-decisions.md; plan §8.1 step 7, slice A25).
 *
 * NOT workbook-derived. The workbook's budgets are typed by hand on each
 * month tab with no suggestion. Getting started offers these beside this
 * month's starting balance, and the app writes one only when the owner
 * taps Accept, as "from this month on" (D12). Each is taken from what the
 * owner actually spent, never an invented ideal, and rounded up to $5 so
 * a first month on it is not "over" by a few cents.
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import { type BudgetHistoryRow, resolveBudgets } from './budgets.js'
import { completeMonths } from './history.js'
import { monthActuals } from './month-actuals.js'
import type { PeriodCategory, PeriodEntry } from './period-sheet.js'
import { median } from './stats.js'
import { SPENDING_LISTS } from './week.js'

export interface StarterBudgetsInput {
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers. */
  readonly readFrom: IsoDate
  /** Every category the entries name. */
  readonly categories: readonly PeriodCategory[]
  readonly entries: readonly PeriodEntry[]
  /** Every budget typed for asOf's month or before it: a category with one in effect is left alone. */
  readonly budgetHistory: readonly BudgetHistoryRow[]
}

export interface StarterBudget {
  readonly categoryId: string
  /** A month's budget, rounded up to $5. */
  readonly budgetCents: Cents
  /** How many complete months it was taken over, 1 to 3. */
  readonly months: number
}

export interface StarterBudgets {
  /** In the Month's order: Bills, Debts, Subscriptions, Variable expenses, each in its own order. */
  readonly offers: readonly StarterBudget[]
  /** The complete months there are to take a budget from (F24); 0 says why nothing is offered. */
  readonly completeMonths: number
}

const STEP = 500
const MONTHS = 3

export function starterBudgets(input: StarterBudgetsInput): StarterBudgets {
  const months = completeMonths(input).months.slice(0, MONTHS)
  if (months.length === 0) return { offers: [], completeMonths: 0 }
  // A typed "no budget" is in effect too: the owner chose it, and no offer overrides it.
  const budgeted = new Set(resolveBudgets({ asOf: input.asOf, history: input.budgetHistory }).budgets.map((b) => b.categoryId))
  const sheets = monthActuals({ categories: input.categories, entries: input.entries, months }).months
  const spending = input.categories
    .filter((c) => SPENDING_LISTS.includes(c.kind) && !budgeted.has(c.id))
    .sort(
      (a, b) =>
        SPENDING_LISTS.indexOf(a.kind) - SPENDING_LISTS.indexOf(b.kind) ||
        a.sortOrder - b.sortOrder ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
  const offers = spending.flatMap((c): StarterBudget[] => {
    const usual = median({ values: sheets.map((m) => m.actuals.get(c.id) ?? missing(c.id)) })
    if (usual === null || usual <= 0) return []
    // Up to the next $5 in whole cents: a multiple of $5 stays as it is.
    const up = usual % STEP === 0 ? usual : usual + STEP - (usual % STEP)
    return [{ categoryId: c.id, budgetCents: cents(up), months: months.length }]
  })
  return { offers, completeMonths: months.length }
}

/** monthActuals gives every category on a list the Month shows, so a spending category is never absent. */
function missing(categoryId: string): never {
  throw new RangeError(`Category ${categoryId} has no Actual in a complete month`)
}
