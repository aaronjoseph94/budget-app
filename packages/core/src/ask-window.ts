/**
 * Ask about your money: which days a question covers (F48,
 * docs/formula-decisions.md; plan slice A24).
 *
 * A question names a period in words ("last month", "in August", "this
 * year"), read by the AI or the app's own matching into one of a fixed set
 * with no digit in it. This turns it into the days to count, ending no
 * later than today, and the like-for-like days before it (F25), both cut
 * to the records covered (F24, F38): a month before the records is
 * missing, never $0.
 *
 * NOT workbook-derived: the workbook answers no questions. The tests are
 * worked by hand.
 */
import { type IsoDate, addDays, isoDate } from '@budget/money-primitives'
import { type DateWindow, comparisonWindow } from './compare.js'
import { coveredFrom } from './shops.js'
import { monthBounds, shiftMonth } from './week.js'

export type AskPeriod =
  | { readonly kind: 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'last_three_months' }
  /** A month by its name, 1 to 12, this year or last. */
  | { readonly kind: 'month'; readonly month: number; readonly yearsBack: 0 | 1 }

export interface AskWindowInput {
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day the rows cover. */
  readonly readFrom: IsoDate
  readonly period: AskPeriod
}

export type AskWindow =
  | {
      readonly status: 'ready'
      /** The days counted, ending no later than asOf. */
      readonly now: DateWindow
      /** The days before, like for like (F25); null when they start before the records. */
      readonly before: DateWindow | null
      /** The first day counted when the records begin inside the period; null when all of it is counted. */
      readonly cutFrom: IsoDate | null
    }
  /** A month by its name that is still to come this year. */
  | { readonly status: 'not_yet' }
  /** Wholly before the records; `coveredFrom` is the first day they cover, null with no records. */
  | { readonly status: 'before_records'; readonly coveredFrom: IsoDate | null }

/** F48: the period's days and the days before them, inside the records. */
export function askWindow(input: AskWindowInput): AskWindow {
  const spans = periodSpans(input)
  if (spans === null) return { status: 'not_yet' }
  const covered = coveredFrom(input)
  if (covered === null || spans.now.to < covered) return { status: 'before_records', coveredFrom: covered }
  const cut = spans.now.from < covered
  return {
    status: 'ready',
    now: cut ? { from: covered, to: spans.now.to } : spans.now,
    // A cut period starts after the days before it would, so those always start before the records too.
    before: spans.before.from < covered ? null : spans.before,
    cutFrom: cut ? covered : null,
  }
}

/** The period's days and the days before, before the records are considered; null when it has not begun. */
function periodSpans(input: AskWindowInput): { readonly now: DateWindow; readonly before: DateWindow } | null {
  const { asOf, period } = input
  const year = Number(asOf.slice(0, 4))
  const compared = (window: ReturnType<typeof comparisonWindow>) => (window.status === 'not_started' ? null : { now: window.now, before: window.before })
  const month = (day: IsoDate) => compared(comparisonWindow({ period: 'month', month: day, asOf, historyStart: input.historyStart }))
  const week = (day: IsoDate) => compared(comparisonWindow({ period: 'week', week: day, asOf, historyStart: input.historyStart }))
  const yearFrom = (y: number) => compared(comparisonWindow({ period: 'year', startMonth: isoDate(`${y}-01-01`), asOf, historyStart: input.historyStart }))
  switch (period.kind) {
    case 'this_week':
      return week(asOf)
    case 'last_week':
      return week(addDays(asOf, -7))
    case 'this_month':
      return month(asOf)
    case 'last_month':
      return month(shiftMonth(asOf, -1))
    case 'this_year':
      return yearFrom(year)
    case 'last_year':
      return yearFrom(year - 1)
    case 'last_three_months': {
      const first = shiftMonth(asOf, -3)
      const earlier = shiftMonth(asOf, -6)
      return {
        now: { from: first, to: monthBounds(shiftMonth(asOf, -1)).end },
        before: { from: earlier, to: addDays(first, -1) },
      }
    }
    case 'month': {
      if (!Number.isInteger(period.month) || period.month < 1 || period.month > 12) {
        throw new RangeError(`A month is 1 to 12, received ${period.month}`)
      }
      return month(isoDate(`${year - period.yearsBack}-${String(period.month).padStart(2, '0')}-01`))
    }
  }
}
