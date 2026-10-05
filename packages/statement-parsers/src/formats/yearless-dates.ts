/**
 * Giving a year to a date that does not carry one.
 *
 * Printed statements routinely write `Aug 6` and put the year only in the
 * period header, which is fine on paper and not fine in a ledger. The year has
 * to be recovered, and recovered without guessing: a date placed twelve months
 * wrong looks entirely normal on screen, sorts plausibly, and quietly lands in
 * the wrong month's budget.
 *
 * So the rule is elimination, not proximity. Every candidate year around the
 * statement period is tried, those falling outside a window are discarded, and
 * a year is returned only when exactly ONE survives. Nothing is nearest-match.
 *
 * Deliberately no `Date`. Constructing one costs a timezone, and a date built
 * in a browser west of UTC can arrive a day earlier than it left.
 */

import type { IsoDate } from '@budget/money-primitives'

export interface StatementPeriod {
  readonly from: IsoDate
  readonly to: IsoDate
}

/**
 * How far before the period a transaction date may fall.
 *
 * A transaction dates from when the card was used, but appears on the
 * statement whose period contains its POSTING date, which can be several days
 * later. A purchase made just before a period opened therefore shows up inside
 * it — the sample this was built against opens on August 8th and its first
 * transaction is August 6th.
 *
 * Sixty days is far beyond any real settlement delay and still far short of a
 * year, which is the only property that matters: the window must never be wide
 * enough for two candidate years to fit inside it.
 */
export const LOOKBACK_DAYS = 60

/** Days from 1970-01-01. Howard Hinnant's civil-date algorithm. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const year = m <= 2 ? y - 1 : y
  const era = Math.floor(year / 400)
  const yoe = year - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146_097 + doe - 719_468
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31
}

/**
 * A year, month and day as an IsoDate string, padded and nothing more: it
 * checks no day. Only for parts already checked (resolveYear, daysInMonth),
 * or passed on to money-primitives' isoDate, which checks (architecture-a-06).
 * Internal to statement-parsers; money-primitives' isoDate is the one the
 * other packages use.
 */
export function civilDate(y: number, m: number, d: number): IsoDate {
  // The year to four digits too: year 19 was '19-01-05' (testing fuzz-06).
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` as IsoDate
}

/**
 * The year a bare month and day belong to, or null if it cannot be known.
 *
 * Null is returned rather than a best guess whenever zero or more than one
 * candidate fits. Zero means the date belongs to some other statement; more
 * than one would mean the window had grown wider than a year. Both are
 * conditions to report, not to resolve — the caller turns null into a rejected
 * row with a readable reason, which a person can act on.
 */
export function resolveYear(month: number, day: number, period: StatementPeriod): number | null {
  const from = period.from.split('-').map(Number)
  const to = period.to.split('-').map(Number)
  // A period that is not three numbers each way is no period, not year 0.
  const [fromY, fromM, fromD] = from
  const [toY, toM, toD] = to
  if (from.length !== 3 || to.length !== 3 || from.some(Number.isNaN) || to.some(Number.isNaN)) return null
  if (fromY === undefined || fromM === undefined || fromD === undefined || toY === undefined || toM === undefined || toD === undefined) return null

  const earliest = daysFromCivil(fromY, fromM, fromD) - LOOKBACK_DAYS
  const latest = daysFromCivil(toY, toM, toD)

  const fits: number[] = []
  for (const year of [fromY - 1, fromY, toY, toY + 1]) {
    if (fits.includes(year)) continue
    // February 29th in a year that has none is not a date at all, and must
    // not be silently moved to the 28th or the 1st of March.
    if (day < 1 || day > daysInMonth(year, month)) continue
    const at = daysFromCivil(year, month, day)
    if (at >= earliest && at <= latest) fits.push(year)
  }
  return fits.length === 1 ? (fits[0] ?? null) : null
}
