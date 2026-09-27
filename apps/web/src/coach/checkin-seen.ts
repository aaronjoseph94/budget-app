/**
 * Whether this week's check-in has been opened on this device (plan §2.1,
 * §2.4): the Coach tab shows a dot from the Sunday a check-in is ready
 * until it is opened. Kept on the device only, in try/catch: a storage that
 * refuses shows the dot until the next Sunday's check-in replaces it,
 * which costs nothing but a dot.
 */
import { checkinWeek, isoDate } from '@budget/core'

const SEEN_KEY = 'budget.coach.checkin.seen'

/** True when the check-in `asOf` falls in has not been opened here. */
export function checkinDue(asOf: string): boolean {
  const week = checkinWeek({ asOf: isoDate(asOf) }).start
  try {
    return window.localStorage.getItem(SEEN_KEY) !== week
  } catch {
    return true
  }
}

export function markCheckinSeen(asOf: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, checkinWeek({ asOf: isoDate(asOf) }).start)
  } catch {
    // As above: the dot stays, and nothing else changes.
  }
}
