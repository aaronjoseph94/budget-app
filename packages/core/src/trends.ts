/**
 * Trends: how a figure has moved over the months, and whether it moved
 * steadily enough to say so (F37, docs/formula-decisions.md; plan §2.6, §7).
 *
 * The workbook's month tabs each hold one month and draw no line across
 * them, so nothing here has a cached value; the tests are worked by hand.
 * A line is only called rising or falling when most of its steps go that
 * way and it moved further than the category usually swings (F27), so one
 * dear month never reads as a habit, and a trend is never named on fewer
 * than four whole months.
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import type { Evidence } from './history.js'
import { notableBand, usualMonth } from './notable.js'
import { monthBounds, shiftMonth } from './week.js'

export interface TrendLabelInput {
  /** Today: its month is still running, and each month after it adds one. */
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The figure in each complete month (F24), in any order. */
  readonly totals: readonly { readonly month: IsoDate; readonly cents: number }[]
}

export type TrendLabel =
  | {
      readonly status: 'rising' | 'falling' | 'no_trend'
      /** Months read: the last up to 6. */
      readonly months: number
      /** Pairs of months next to each other, and how many rose and fell by $1.00 or more. */
      readonly pairs: number
      readonly rises: number
      readonly falls: number
      readonly firstMonth: IsoDate
      readonly lastMonth: IsoDate
      readonly firstCents: Cents
      readonly lastCents: Cents
      /** F27 over the same months. */
      readonly usualCents: Cents
      readonly bandCents: Cents
      readonly evidence: Evidence
    }
  /** Under 4 complete months. `possibleFrom` is the month a label becomes possible; null with no records. */
  | { readonly status: 'not_enough'; readonly months: number; readonly possibleFrom: IsoDate | null }

/** Fewer whole months than this, and no line is called anything. */
export const TREND_MONTHS = 4
const READ = 6
/** F26: under $1.00 either way is the same. */
const SAME = 100

export function trendLabel(input: TrendLabelInput): TrendLabel {
  const recent = [...input.totals].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0)).slice(-READ)
  const n = recent.length
  if (n < TREND_MONTHS) return { status: 'not_enough', months: n, possibleFrom: possibleFrom(input, n) }

  let rises = 0
  let falls = 0
  for (let i = 1; i < n; i++) {
    const step = recent[i]!.cents - recent[i - 1]!.cents
    if (step >= SAME) rises++
    else if (step <= -SAME) falls++
  }
  const usual = usualMonth({ totals: recent.map((t) => ({ month: t.month, cents: cents(t.cents) })) })
  // At least four months, so there is a usual month and a spread.
  const usualCents = usual.usualCents!
  const { bandCents } = notableBand({ basis: 'usual', usualCents, madCents: usual.madCents!, months: n, days: 1, daysInMonth: 1 })
  const first = recent[0]!
  const last = recent[n - 1]!
  const climb = last.cents - first.cents
  const pairs = n - 1
  // At least 75% of the pairs, in whole numbers: 4 × count ≥ 3 × pairs.
  const steady = (count: number) => 4 * count >= 3 * pairs
  const status = steady(rises) && climb >= bandCents ? 'rising' : steady(falls) && -climb >= bandCents ? 'falling' : 'no_trend'
  return {
    status,
    months: n,
    pairs,
    rises,
    falls,
    firstMonth: first.month,
    lastMonth: last.month,
    firstCents: cents(first.cents),
    lastCents: cents(last.cents),
    usualCents,
    bandCents,
    evidence: usual.evidence,
  }
}

/**
 * The first month a label can be given: each month from asOf's adds one
 * complete month, and none can be complete before the records' first whole
 * month, so the later of the two.
 */
function possibleFrom(input: TrendLabelInput, have: number): IsoDate | null {
  const start = input.historyStart
  if (start === null) return null
  const firstWhole = start === monthBounds(start).start ? start : shiftMonth(start, 1)
  const byToday = shiftMonth(input.asOf, TREND_MONTHS - have)
  const byRecords = shiftMonth(firstWhole, TREND_MONTHS)
  return byToday > byRecords ? byToday : byRecords
}
