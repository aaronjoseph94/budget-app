/**
 * A category's usual month, and when a change is worth saying (F27,
 * docs/formula-decisions.md).
 *
 * The workbook keeps no history across months, so nothing here has a cached
 * value; the tests are worked by hand. A change is judged against how much
 * the category usually moves, not a flat amount: $40 more on groceries that
 * swing by $100 a month is noise, and on a steady phone bill it is news.
 * Every percentage is taken in BigInt and rounded half-up, as F26 rounds.
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import { type Evidence, evidenceOf } from './history.js'
import { mad, median } from './stats.js'
import { halfUp } from './round.js'

export interface UsualMonthInput {
  /** A category's total in each complete month (F24), in any order. */
  readonly totals: readonly { readonly month: IsoDate; readonly cents: Cents }[]
}

export interface UsualMonth {
  /** The median of up to the six most recent; null with none. */
  readonly usualCents: Cents | null
  /** The median of their distances from it; null with none. */
  readonly madCents: Cents | null
  /** How many months it was taken over, at most 6. */
  readonly months: number
  readonly evidence: Evidence
}

const USUAL_MONTHS = 6

export function usualMonth(input: UsualMonthInput): UsualMonth {
  const recent = [...input.totals].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0)).slice(0, USUAL_MONTHS)
  const values = recent.map((t) => t.cents)
  const usual = median({ values })
  const spread = mad({ values })
  return {
    usualCents: usual === null ? null : cents(usual),
    madCents: spread === null ? null : cents(spread),
    months: recent.length,
    evidence: evidenceOf(recent.length),
  }
}

export type NotableBandInput =
  /** A category's change, against its usual month, over d days of a month of D. */
  | {
      readonly basis: 'usual'
      readonly usualCents: Cents
      readonly madCents: Cents
      /** Complete months the usual month was taken over, 1 or more. */
      readonly months: number
      readonly days: number
      readonly daysInMonth: number
    }
  /** A summary (this month, this week), against the same days before (F25). */
  | { readonly basis: 'summary'; readonly beforeCents: Cents }

/** $25: under this, no change is ever notable, however quiet the category. */
const FLOOR = 2_500

export function notableBand(input: NotableBandInput): { readonly bandCents: Cents } {
  if (input.basis === 'summary') return { bandCents: cents(Math.max(FLOOR, percent(input.beforeCents, 1_500))) }
  const { usualCents, madCents, months, days, daysInMonth } = input
  if (!Number.isInteger(months) || months < 1) throw new RangeError(`A usual month needs a complete month, received ${months}`)
  if (!Number.isInteger(days) || days < 1 || days > daysInMonth) {
    throw new RangeError(`A window of ${days} days is not inside a month of ${daysInMonth}`)
  }
  // On so little history a spread means nothing, so the share is wider instead.
  const whole =
    months >= 3
      ? Math.max(FLOOR, percent(usualCents, 1_500), 3 * madCents)
      : Math.max(FLOOR, percent(usualCents, 2_500))
  return { bandCents: cents(Math.max(FLOOR, halfUp(BigInt(whole) * BigInt(days), BigInt(daysInMonth)))) }
}

export interface ChangeSize {
  readonly size: 'slight' | 'clear' | 'big'
  /** Clear or big: worth a card. */
  readonly notable: boolean
}

/** Under one band slight, from one band to under two clear, from two big; either way. */
export function changeSize(input: { readonly changeCents: Cents; readonly bandCents: Cents }): ChangeSize {
  const size = Math.abs(input.changeCents)
  const band = input.bandCents
  const named = size >= 2 * band ? 'big' : size >= band ? 'clear' : 'slight'
  return { size: named, notable: named !== 'slight' }
}

/** |amount| × bp ÷ 10,000, half-up. */
function percent(amount: Cents, bp: number): number {
  return halfUp(BigInt(Math.abs(amount)) * BigInt(bp), 10_000n)
}
