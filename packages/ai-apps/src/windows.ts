/**
 * Which days a tool reads (PLAN §2.5): whole months around the day asked
 * about, with core's date helpers, so SQL does no date arithmetic. A month
 * wider each side than the period needs, so the owner's time zone can never
 * cut a day off; core picks the exact period from the owner's today.
 */
import { isoDate, monthBounds, shiftMonth } from '@budget/core'
import type { IsoDate } from '@budget/money-primitives'

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
