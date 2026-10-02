/**
 * One month in review (F36, docs/formula-decisions.md; plan §2.6, §7, A15):
 * its Income, Spent and Saved and the share saved, against last month and
 * against the usual month, the categories that moved furthest from their
 * usual month, and each Variable category this month beside last.
 *
 * Everything the Reports' Overview shows is here, so the screen formats and
 * never computes. No workbook cell; the tests are worked by hand.
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import { type Change, type DateWindow, change, periodComparison } from './compare.js'
import { completeMonths } from './history.js'
import { monthActuals } from './month-actuals.js'
import { type Totals, windowTotals } from './month-totals.js'
import { type Mover, biggestMovers } from './movers.js'
import { changeSize, notableBand } from './notable.js'
import type { PeriodCategory, PeriodEntry } from './period-sheet.js'
import type { PlanHistoryRow } from './plans.js'
import { scaleSeries } from './scale.js'
import { median } from './stats.js'
import { monthBounds } from './week.js'

export interface MonthReportInput {
  /** Today. */
  readonly asOf: IsoDate
  /** Any day of the month reviewed. */
  readonly month: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers; it must reach the month before the one reviewed. */
  readonly readFrom: IsoDate
  readonly categories: readonly PeriodCategory[]
  readonly planHistory: readonly PlanHistoryRow[]
  readonly entries: readonly PeriodEntry[]
}

/** One of the three totals against last month, sized by the summary's band (F27). */
export interface TotalChange {
  readonly change: Change
  readonly size: 'slight' | 'clear' | 'big'
}

export type LastMonth =
  | {
      readonly status: 'compared'
      /** The days of last month set against the reviewed ones (F25). */
      readonly window: DateWindow
      readonly income: TotalChange
      readonly spent: TotalChange
      readonly saved: TotalChange
    }
  /** Last month's window starts before the records (F24). */
  | { readonly status: 'before_records'; readonly window: DateWindow }

/** Each total against its usual month: `beforeCents` is the usual month, `nowCents` this one (F26). */
export interface UsualTotals {
  readonly income: Change
  readonly spent: Change
  readonly saved: Change
}

/** A Variable category this month and last, with each bar's length from core. */
export interface PairedRow {
  readonly categoryId: string
  readonly nowCents: Cents
  readonly beforeCents: Cents
  readonly nowBp: number
  readonly beforeBp: number
}

export type MonthReport =
  | { readonly status: 'not_started' | 'before_records'; readonly month: IsoDate }
  | {
      /** So far: the month holding asOf. Partly recorded: the records start inside it. */
      readonly status: 'so_far' | 'complete' | 'partly_recorded'
      readonly month: IsoDate
      readonly window: DateWindow
      readonly totals: Totals
      readonly lastMonth: LastMonth
      /** Up to 6 complete months before this one; null for a month so far, or with none. */
      readonly usual: UsualTotals | null
      /** How many complete months before this one the usual month stands on, 0 to 6. */
      readonly usualMonths: number
      readonly movers: { readonly up: readonly Mover[]; readonly down: readonly Mover[] }
      /** Empty unless last month was compared. */
      readonly pairs: readonly PairedRow[]
    }

const USUAL_MONTHS = 6
const PAIRS = 8

export function monthReport(input: MonthReportInput): MonthReport {
  const { asOf, historyStart } = input
  const { start, end } = monthBounds(input.month)
  if (start > asOf) return { status: 'not_started', month: start }
  if (historyStart === null || end < historyStart) return { status: 'before_records', month: start }
  const running = asOf <= end
  if (start < input.readFrom && !running) throw new RangeError(`${start} was not read: rows start on ${input.readFrom}`)
  const status = running ? 'so_far' : start >= historyStart ? 'complete' : 'partly_recorded'
  const window = { from: start, to: running ? asOf : end }
  const totals = windowTotals(input, window.from, window.to)
  const daysInMonth = Number(end.slice(8))
  const days = Number(window.to.slice(8))

  const before = completeMonths({ asOf, historyStart, readFrom: input.readFrom }).months.filter((m) => m < start).slice(0, USUAL_MONTHS)
  const history = monthActuals({ categories: input.categories, entries: input.entries, months: before }).months
  const nowActuals = monthActuals({ categories: input.categories, entries: input.entries.filter((e) => e.postedOn <= window.to), months: [start] }).months[0]!
  const variable = input.categories.filter((c) => c.kind === 'variable')
  const movers = biggestMovers({
    days,
    daysInMonth,
    categories: variable.map((c) => ({
      categoryId: c.id,
      sortOrder: c.sortOrder,
      nowCents: nowActuals.actuals.get(c.id)!,
      history: history.map((h) => ({ month: h.month, cents: h.actuals.get(c.id)! })),
    })),
  })

  const comparison = periodComparison({ period: 'month', month: start, asOf, historyStart, categories: input.categories, planHistory: input.planHistory, entries: input.entries })
  const lastMonth = lastMonthOf(comparison)
  const pairs = comparison.status === 'compared' ? paired(variable, comparison.blocks.variable.rows) : []
  return { status, month: start, window, totals, lastMonth, usual: running ? null : usualOf(input, before, totals), usualMonths: before.length, movers, pairs }
}

type Compared = ReturnType<typeof periodComparison>

/** F25 and F26 on the three totals, each sized by the summary's band (F27). */
function lastMonthOf(comparison: Compared): LastMonth {
  if (comparison.status === 'before_records') return { status: 'before_records', window: comparison.before }
  // The month reviewed has started (checked above), so the only other answer is a comparison.
  if (comparison.status !== 'compared') throw new RangeError('A month that has started is always compared or before the records')
  const sized = (change: Change): TotalChange => ({
    change,
    size: changeSize({ changeCents: change.changeCents, bandCents: notableBand({ basis: 'summary', beforeCents: change.beforeCents }).bandCents }).size,
  })
  const { income, spent, saved } = comparison.summary
  return {
    status: 'compared',
    window: comparison.before,
    income: sized(income),
    spent: sized(spent),
    saved: sized(saved),
  }
}

/** The median of each whole-month total over the months before the one reviewed (F27's median). */
function usualOf(input: MonthReportInput, months: readonly IsoDate[], now: Totals): UsualTotals | null {
  if (months.length === 0) return null
  const each = months.map((m) => windowTotals(input, m, monthBounds(m).end))
  const middle = (pick: (t: Totals) => Cents): Cents => cents(median({ values: each.map(pick) })!)
  return {
    income: change(now.incomeCents, middle((t) => t.incomeCents), true),
    spent: change(now.spentCents, middle((t) => t.spentCents), false),
    saved: change(now.savedCents, middle((t) => t.savedCents), true),
  }
}

/** The 8 Variable rows with the largest of their two figures, and each bar's length (F36). */
function paired(variable: readonly PeriodCategory[], rows: readonly { categoryId: string; nowCents: Cents; beforeCents: Cents }[]): PairedRow[] {
  const order = new Map(variable.map((c) => [c.id, c.sortOrder]))
  const larger = (r: { nowCents: Cents; beforeCents: Cents }) => Math.max(r.nowCents, r.beforeCents)
  const chosen = rows
    .filter((r) => r.nowCents !== 0 || r.beforeCents !== 0)
    .sort((a, b) => larger(b) - larger(a) || order.get(a.categoryId)! - order.get(b.categoryId)! || (a.categoryId < b.categoryId ? -1 : 1))
    .slice(0, PAIRS)
  // $0 is on the scale, and a figure below it draws no bar.
  const drawn = (v: Cents) => Math.max(0, v)
  const { bps } = scaleSeries({ values: [0, ...chosen.flatMap((r) => [drawn(r.nowCents), drawn(r.beforeCents)])] })
  const length = (v: Cents, i: number) => (drawn(v) === 0 ? 0 : bps[i]!)
  return chosen.map((r, i) => ({ categoryId: r.categoryId, nowCents: r.nowCents, beforeCents: r.beforeCents, nowBp: length(r.nowCents, 1 + 2 * i), beforeBp: length(r.beforeCents, 2 + 2 * i) }))
}
