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
import { type Evidence, completeMonths } from './history.js'
import { monthActuals } from './month-actuals.js'
import { type MonthTotals, monthlyTotals } from './month-totals.js'
import { notableBand, usualMonth } from './notable.js'
import type { PeriodCategory, PeriodEntry } from './period-sheet.js'
import type { PlanHistoryRow } from './plans.js'
import { scaleSeries } from './scale.js'
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

export interface TrendWindowInput {
  /** Today: the window is the months before its month. */
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers: a month before it was not read, and is a gap, not $0. */
  readonly readFrom: IsoDate
  /** How many months the view shows. */
  readonly months: 6 | 12
  readonly categories: readonly PeriodCategory[]
  readonly entries: readonly PeriodEntry[]
}

/** One line: a figure per month of the window, oldest first; null is a gap, never $0. */
export interface TrendLine {
  readonly points: readonly (Cents | null)[]
  /** Each point's height, placed by scaleSeries; null where the point is. */
  readonly pointsBp: readonly (number | null)[]
  readonly label: TrendLabel
}

export interface MonthlyTrend {
  /** The window's months by their first day, oldest first. */
  readonly months: readonly IsoDate[]
  readonly income: TrendLine
  readonly spent: TrendLine
  readonly saved: TrendLine
  /** Where $0 sits on the three lines' one scale. */
  readonly zeroBp: number
}

/** F37: Income, Spent and Saved in each complete month of the window, on one scale so the lines compare. */
export function monthlyTrend(input: TrendWindowInput & { readonly planHistory: readonly PlanHistoryRow[] }): MonthlyTrend {
  const months = windowOf(input)
  const byMonth = new Map(monthlyTotals(input).months.map((t) => [t.month as string, t]))
  const pick = (figure: (t: MonthTotals) => Cents) => months.map((m) => {
    const totals = byMonth.get(m)
    return totals === undefined ? null : figure(totals)
  })
  const figures = [pick((t) => t.incomeCents), pick((t) => t.spentCents), pick((t) => t.savedCents)]
  const { lines, zeroBp } = placed(figures)
  const [income, spent, saved] = figures.map((points, i) => ({ points, pointsBp: lines[i]!, label: labelOf(input, months, points) }))
  return { months, income: income!, spent: spent!, saved: saved!, zeroBp }
}

export interface CategoryTrend extends TrendLine {
  readonly categoryId: string
  /** F27's usual month over up to its 6 most recent complete months; null with none. */
  readonly usualCents: Cents | null
  readonly usualBp: number | null
  /** Where $0 sits on the row's own scale. */
  readonly zeroBp: number
}

const ORDER: Readonly<Record<TrendLabel['status'], number>> = { rising: 0, falling: 1, no_trend: 2, not_enough: 3 }

/**
 * F37: each Variable expenses category with a figure other than $0 in a
 * complete month of the window, its Actual month by month against its usual
 * level. Steady ones first, rising then falling, then the list's order.
 */
export function categoryTrends(input: TrendWindowInput): { readonly months: readonly IsoDate[]; readonly categories: readonly CategoryTrend[] } {
  const months = windowOf(input)
  const whole = new Set<string>(completeMonths(input).months)
  const read = monthActuals({ categories: input.categories, entries: input.entries, months: months.filter((m) => whole.has(m)) }).months
  const actuals = new Map(read.map((m) => [m.month as string, m.actuals]))
  const trends = input.categories
    .filter((c) => c.kind === 'variable')
    .flatMap((c): { trend: CategoryTrend; order: number }[] => {
      const points = months.map((m) => {
        const month = actuals.get(m)
        return month === undefined ? null : month.get(c.id)!
      })
      if (points.every((p) => p === null || p === 0)) return []
      const had = months.flatMap((month, i) => (points[i] === null ? [] : [{ month, cents: points[i]! }]))
      const { usualCents } = usualMonth({ totals: had })
      const { lines, zeroBp } = placed([points, [usualCents]])
      const trend = { categoryId: c.id, points, pointsBp: lines[0]!, usualCents, usualBp: lines[1]![0]!, zeroBp, label: labelOf(input, months, points) }
      return [{ trend, order: c.sortOrder }]
    })
  trends.sort(
    (a, b) =>
      ORDER[a.trend.label.status] - ORDER[b.trend.label.status] ||
      a.order - b.order ||
      (a.trend.categoryId < b.trend.categoryId ? -1 : a.trend.categoryId > b.trend.categoryId ? 1 : 0),
  )
  return { months, categories: trends.map((t) => t.trend) }
}

/** The window's months, oldest first, ending with the month before asOf's. */
function windowOf(input: TrendWindowInput): IsoDate[] {
  return Array.from({ length: input.months }, (_, i) => shiftMonth(input.asOf, i - input.months))
}

function labelOf(input: TrendWindowInput, months: readonly IsoDate[], points: readonly (Cents | null)[]): TrendLabel {
  const totals = months.flatMap((month, i) => (points[i] === null ? [] : [{ month, cents: points[i]! }]))
  return trendLabel({ asOf: input.asOf, historyStart: input.historyStart, totals })
}

/** Every series on one scale from $0 (scaleSeries), so no chart divides money and $0 is always on it. */
function placed(series: readonly (readonly (Cents | null)[])[]): { lines: (number | null)[][]; zeroBp: number } {
  const values = series.flatMap((s) => s.filter((v): v is Cents => v !== null))
  const { bps, zeroBp } = scaleSeries({ values: [0, ...values] })
  let next = 1
  const lines = series.map((s) => s.map((v) => (v === null ? null : bps[next++]!)))
  // $0 is one of the values, so it always lies on the scale.
  return { lines, zeroBp: zeroBp! }
}
