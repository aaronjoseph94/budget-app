/**
 * money-primitives — the root of the dependency graph.
 *
 * Zero runtime dependencies, including zod. Both the calculation engine and
 * the zod contracts need the money type; if either owned it, the dependency
 * arrow between them would become a cycle. See CAPABILITY-MAP.md.
 */

/**
 * Integer minor units (cents). Never a float.
 *
 * The brand is what makes `CONSTRAINTS.md`'s "zero float money" rule a compile
 * error rather than a convention: a raw `number` will not satisfy `Cents` at
 * any engine boundary.
 */
export type Cents = number & { readonly __brand: 'Cents' }

/** Hundredths of a percent. 500 bp = 5.00% APR. */
export type BasisPoints = number & { readonly __brand: 'BasisPoints' }

/** A calendar date, `YYYY-MM-DD`. Deliberately a string: no timezone, no clock. */
export type IsoDate = string & { readonly __brand: 'IsoDate' }

export const ZERO_CENTS = 0 as Cents

export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Cents must be a whole number of minor units, received ${value}`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Cents outside safe integer range: ${value}`)
  }
  return value as Cents
}

export function basisPoints(value: number): BasisPoints {
  if (!Number.isInteger(value)) {
    throw new RangeError(`BasisPoints must be a whole number, received ${value}`)
  }
  if (value < 0) throw new RangeError(`BasisPoints must not be negative, received ${value}`)
  return value as BasisPoints
}

export const addCents = (a: Cents, b: Cents): Cents => cents(a + b)
export const subCents = (a: Cents, b: Cents): Cents => cents(a - b)
export const minCents = (a: Cents, b: Cents): Cents => (a <= b ? a : b)
export const sumCents = (values: readonly Cents[]): Cents =>
  values.reduce<Cents>((acc, v) => cents(acc + v), ZERO_CENTS)

/**
 * One month of simple interest at `apr / 12`, rounded half-up to the cent.
 *
 * Excel Semantics (Debt Calculator, J20/O20/T20/Y20): the workbook applies a
 * flat monthly rate of APR/12 with no day-count adjustment. It retains sub-cent
 * fractions; this rounds to whole cents each month because fractions of a cent
 * cannot be paid. See docs/divergences.md D1.
 *
 * Integer arithmetic throughout: balance * bp / (10_000 * 12).
 */
export function accrueMonthlyInterest(balance: Cents, apr: BasisPoints): Cents {
  if (balance <= 0 || apr === 0) return ZERO_CENTS
  return cents(Math.round((balance * apr) / 120_000))
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isoDate(value: string): IsoDate {
  const m = ISO_DATE.exec(value)
  if (!m) throw new RangeError(`Expected an ISO date (YYYY-MM-DD), received "${value}"`)
  const [, y, mo, d] = m
  const month = Number(mo)
  const day = Number(d)
  if (month < 1 || month > 12) throw new RangeError(`Month out of range in "${value}"`)
  if (day < 1 || day > daysInMonth(Number(y), month)) {
    throw new RangeError(`Day out of range in "${value}"`)
  }
  return value as IsoDate
}

/**
 * The calendar is worked out here, not by Date: Date.UTC reads a year from
 * 0 to 99 as 1900 to 1999, so a day in year 25 plus one was in 1925, and
 * 0000-02-29 was refused (testing fuzz-07, N147). The proleptic Gregorian
 * calendar, every year 0000 to 9999 as written.
 */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

/** Days from 1970-01-01 (Howard Hinnant's days_from_civil). */
function dayNumber(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const year = m <= 2 ? y - 1 : y
  const era = Math.floor(year / 400)
  const yoe = year - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  return era * 146_097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719_468
}

/** The date so many days from 1970-01-01 (civil_from_days), refused outside the years an ISO date writes. */
function fromDayNumber(days: number): IsoDate {
  const z = days + 719_468
  const era = Math.floor(z / 146_097)
  const doe = z - era * 146_097
  const yoe = Math.floor((doe - Math.floor(doe / 1_460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return written(yoe + era * 400 + (m <= 2 ? 1 : 0), m, d)
}

/** A year, month and day as an IsoDate; a year an ISO date cannot write is refused. */
function written(year: number, month: number, day: number): IsoDate {
  if (year < 0 || year > 9999) throw new RangeError(`Year ${year} is outside 0000 to 9999`)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}` as IsoDate
}

/**
 * Add whole months, clamping the day to the target month's length
 * (2025-01-31 + 1 month = 2025-02-28). Mirrors Excel's EDATE.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const total = (y * 12 + (m - 1)) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return written(year, month, Math.min(d, daysInMonth(year, month)))
}

/** Whole days between two dates. Positive when `to` is later. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(to) - dayNumber(from)
}

/**
 * Whole calendar months from `from` to `to`, as Excel's `DATEDIF(from, to,
 * "M")` counts them (Savings!V14): the difference in months, less one when
 * `to`'s day of the month is before `from`'s. So 2024-01-31 to 2024-02-29
 * is 0, and 2024-01-08 to 2025-10-08 is 21. DATEDIF gives `#NUM!` when `to`
 * is before `from`; this throws, so a caller has to say what that means.
 */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  if (to < from) throw new RangeError(`${to} is before ${from}; DATEDIF has no months for it`)
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number]
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number]
  const months = (y2 - y1) * 12 + (m2 - m1)
  return d2 < d1 ? months - 1 : months
}

/** Add whole days. */
export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(dayNumber(date) + Math.floor(days))
}

export { formatCents } from './format.js'
