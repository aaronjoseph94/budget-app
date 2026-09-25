/**
 * Safe to spend, a day (F31, docs/formula-decisions.md; plan slice A13).
 *
 * NOT workbook-derived. What is left once every planned bill, the pay still
 * to come and the savings still planned are counted, over the days left
 * with today among them, rounded down so following it never overspends by
 * a cent. Never a negative daily figure, and none without a typed start
 * (D17). Nothing here is stored.
 */
import { type Cents, ZERO_CENTS, cents } from '@budget/money-primitives'
import { type MonthForecastInput, monthPosition } from './month-position.js'
import { monthBounds } from './week.js'

export interface SafeToSpend {
  /** `ok`; `nothing_left` at $0 or less available; `no_start` with no start typed. */
  readonly status: 'ok' | 'nothing_left' | 'no_start'
  /** start + income + pay still due − Spent − saved − savings still planned; null with no start. */
  readonly availableCents: Cents | null
  /** Days left in the month, today included. */
  readonly days: number
  /** Available ÷ days, rounded down to the cent; $0 when nothing is left; null with no start. */
  readonly perDayCents: Cents | null
  /** Income sources whose pay could not be counted (F29), so the figure is lower than it will be. */
  readonly payNotCounted: readonly string[]
}

export function safeToSpend(input: MonthForecastInput): SafeToSpend {
  const { availableCents, pay } = monthPosition(input)
  const days = Number(monthBounds(input.asOf).end.slice(8)) - Number(input.asOf.slice(8)) + 1
  const shared = { availableCents, days, payNotCounted: pay.notCounted }
  if (availableCents === null) return { ...shared, status: 'no_start', perDayCents: null }
  if (availableCents <= 0) return { ...shared, status: 'nothing_left', perDayCents: ZERO_CENTS }
  return { ...shared, status: 'ok', perDayCents: cents(Math.floor(availableCents / days)) }
}
