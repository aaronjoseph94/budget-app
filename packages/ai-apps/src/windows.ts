/**
 * Which days a tool reads (PLAN §2.5): whole months around the day asked
 * about, with core's date helpers, so SQL does no date arithmetic. A month
 * wider each side than the period needs, so the owner's time zone can never
 * cut a day off; core picks the exact period from the owner's today.
 */
import { isoDate, monthBounds, shiftMonth } from '@budget/core'
import { addDays, daysBetween, type IsoDate } from '@budget/money-primitives'

export interface Window {
  readonly from: IsoDate
  readonly to: IsoDate
}

/** The server's date, which the owner's is at most a day either side of. */
export const utcToday = (): IsoDate => isoDate(new Date().toISOString().slice(0, 10))

/** The whole months from `back` months before the anchor's to `ahead` months after it. */
export function monthsAround(anchor: IsoDate, back: number, ahead: number): Window {
  return { from: shiftMonth(anchor, -back), to: monthBounds(shiftMonth(anchor, ahead)).end }
}

/** January to December of the year holding `day`: the Year's twelve months when no start is picked (N43). */
export function calendarYear(day: IsoDate): Window {
  return { from: isoDate(`${day.slice(0, 4)}-01-01`), to: isoDate(`${day.slice(0, 4)}-12-31`) }
}

/** How many months back a comparison reads, beside the month either side. */
const BACK = { month: 2, pay_period: 2 } as const

/**
 * What get_period reads around the day asked about: the months either
 * side, or for a year every month of each calendar year the owner's day
 * could fall in, since the server's date can be a day off the owner's.
 * A comparison reaches back one period more: a month further for a month
 * or a pay period (the period before one holding the 1st starts two months
 * back; the owner's day is never a month behind the server's), a year for
 * a year; a week's fits already. The window-invariance test decides each.
 */
export function periodWindow(period: 'month' | 'week' | 'pay_period' | 'year', anchor: IsoDate, compare: boolean): Window {
  if (period === 'year') {
    const from = calendarYear(addDays(anchor, -1)).from
    return { from: compare ? shiftMonth(from, -12) : from, to: calendarYear(addDays(anchor, 1)).to }
  }
  return monthsAround(anchor, compare && period !== 'week' ? BACK[period] : 1, 1)
}

/** A search's days when none are given, back from its last. */
const SEARCH_DAYS = 90
/** The most a search spans: three years, a leap day among them. */
const SEARCH_MOST_DAYS = 1096

/**
 * A search's days: as asked, else the last 90 days to the day after the
 * server's, which the owner's today is never past. Null when they run
 * backwards or span more than three years.
 */
export function searchWindow(from: IsoDate | undefined, to: IsoDate | undefined, anchor: IsoDate): Window | null {
  const end = to ?? addDays(anchor, 1)
  const start = from ?? addDays(end, -SEARCH_DAYS)
  return start <= end && daysBetween(start, end) <= SEARCH_MOST_DAYS ? { from: start, to: end } : null
}
