/**
 * Which days a tool reads (PLAN §2.5): whole months around the day asked
 * about, with core's date helpers, so SQL does no date arithmetic. A month
 * wider each side than the period needs, so the owner's time zone can never
 * cut a day off; core picks the exact period from the owner's today.
 */
import { isoDate, monthBounds, shiftMonth } from '@budget/core'
import { addDays, type IsoDate } from '@budget/money-primitives'

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

/**
 * What get_period reads around the day asked about: the months either
 * side, or for a year every month of each calendar year the owner's day
 * could fall in, since the server's date can be a day off the owner's.
 */
export function periodWindow(period: 'month' | 'week' | 'pay_period' | 'year', anchor: IsoDate): Window {
  if (period !== 'year') return monthsAround(anchor, 1, 1)
  return { from: calendarYear(addDays(anchor, -1)).from, to: calendarYear(addDays(anchor, 1)).to }
}
