/**
 * Where a category is heading this month, and where it stands against its
 * budget (F28, docs/formula-decisions.md).
 *
 * The workbook shows Left and nothing about pace, so nothing here has a
 * cached value; the tests are worked by hand. A pace is an estimate, so it
 * waits for day 7 (a week's groceries scaled up read as a month's four times
 * over) and needs to be well over budget to be worth a card; a budget passed
 * is a fact, and needs only to be past it by a dollar.
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import { monthBounds } from './week.js'
import { halfUp } from './round.js'

export interface CategoryPaceInput {
  /** Today. */
  readonly asOf: IsoDate
  /** The month the Actual is for, by its first day. */
  readonly month: IsoDate
  /** The category's Actual in that month so far. */
  readonly actualCents: Cents
  readonly budgetCents: Cents | null
}

export interface CategoryPace {
  /** `actual × D ÷ d`, half-up; null before day 7 or for a month not running. */
  readonly paceCents: Cents | null
  /** `pace − budget`, when a budget is set and that is above 0. */
  readonly overCents: Cents | null
  /** Over by at least max($25, 15% of the budget). */
  readonly notable: boolean
}

/** The first day of a month with a pace; F30's forecast starts on the same day. */
export const FIRST_DAY_WITH_A_PACE = 7

export function categoryPace(input: CategoryPaceInput): CategoryPace {
  const { start, end } = monthBounds(input.month)
  const day = Number(input.asOf.slice(8))
  if (input.asOf < start || input.asOf > end || day < FIRST_DAY_WITH_A_PACE) {
    return { paceCents: null, overCents: null, notable: false }
  }
  const daysInMonth = Number(end.slice(8))
  const size = halfUp(BigInt(Math.abs(input.actualCents)) * BigInt(daysInMonth), BigInt(day))
  const pace = cents(input.actualCents < 0 ? -size : size)
  const budget = input.budgetCents
  const over = budget !== null && budget > 0 && pace > budget ? cents(pace - budget) : null
  const line = budget === null ? 0 : Math.max(2_500, halfUp(BigInt(budget) * 1_500n, 10_000n))
  return { paceCents: pace, overCents: over, notable: over !== null && over >= line }
}

export interface BudgetStandingInput {
  readonly actualCents: Cents
  readonly budgetCents: Cents | null
}

export interface BudgetStanding {
  /** Over the budget; near from 90% of it up to it; under below that; none without a budget above $0. */
  readonly standing: 'over' | 'near' | 'under' | 'none'
  /** `actual − budget` when over. */
  readonly overCents: Cents | null
  /** `budget − actual` when near or under. */
  readonly leftCents: Cents | null
  /** Over by $1.00 or more, or near. */
  readonly notable: boolean
}

export function budgetStanding(input: BudgetStandingInput): BudgetStanding {
  const { actualCents: actual, budgetCents: budget } = input
  if (budget === null || budget <= 0) return { standing: 'none', overCents: null, leftCents: null, notable: false }
  if (actual > budget) {
    const over = cents(actual - budget)
    return { standing: 'over', overCents: over, leftCents: null, notable: over >= 100 }
  }
  const near = BigInt(actual) * 10_000n >= 9_000n * BigInt(budget)
  return { standing: near ? 'near' : 'under', overCents: null, leftCents: cents(budget - actual), notable: near }
}
