/**
 * This period beside the one before it (F24, F25, F26; docs/formula-decisions.md).
 *
 * The workbook's tabs each hold one period and refer to no other, so none of
 * this has a cached value; it is D26, and the tests are worked by hand.
 *
 * Like for like: a month still running is set against the same days of the
 * month before, never against a whole one, and a month already over against
 * the whole month before. Nothing is compared across the start of the records
 * (F24), because a month missing from them is not a month of $0.
 */
import { type IsoDate, addDays } from '@budget/money-primitives'
import { monthBounds, shiftMonth } from './week.js'

/** Both ends included, as periodSheet reads a window (F4). */
export interface DateWindow {
  readonly from: IsoDate
  readonly to: IsoDate
}

export interface ComparisonWindowInput {
  /** Only months so far; the week, the pay period and the Year join in plan slice A04. */
  readonly period: 'month'
  /** Any day of the month shown. */
  readonly month: IsoDate
  /** Today: which month is running, and on which day. */
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
}

export type ComparisonWindow =
  | {
      readonly status: 'compared'
      /** True while the month runs: both windows stop at asOf's day of the month. */
      readonly sameDays: boolean
      readonly now: DateWindow
      readonly before: DateWindow
    }
  /** The month has not begun, so there is nothing yet to compare. */
  | { readonly status: 'not_started' }
  /** The earlier window starts before the records, so it is left out (F24). */
  | {
      readonly status: 'before_records'
      readonly now: DateWindow
      readonly before: DateWindow
      readonly historyStart: IsoDate | null
    }

/** F25, for a month. */
export function comparisonWindow(input: ComparisonWindowInput): ComparisonWindow {
  const shown = monthBounds(input.month)
  const running = monthBounds(input.asOf)
  if (shown.start > running.start) return { status: 'not_started' }
  const previous = monthBounds(shiftMonth(shown.start, -1))
  const sameDays = shown.start === running.start
  const day = Number(input.asOf.slice(8))
  const now = { from: shown.start, to: sameDays ? input.asOf : shown.end }
  // Days 1..min(d, its length): a short month's window ends with the month
  // rather than running on into the next.
  const lastDay = Number(previous.end.slice(8))
  const before = { from: previous.start, to: sameDays ? addDays(previous.start, Math.min(day, lastDay) - 1) : previous.end }
  if (input.historyStart === null || before.from < input.historyStart) {
    return { status: 'before_records', now, before, historyStart: input.historyStart }
  }
  return { status: 'compared', sameDays, now, before }
}
