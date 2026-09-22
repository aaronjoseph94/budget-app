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
 * cannot be paid. See docs/divergences.md.
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

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
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
  const day = Math.min(d, daysInMonth(year, month))
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}` as IsoDate
}
