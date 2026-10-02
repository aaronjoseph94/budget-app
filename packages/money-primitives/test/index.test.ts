import { describe, expect, it } from 'vitest'
import { accrueMonthlyInterest, addDays, addMonths, basisPoints, cents, daysBetween, isoDate, monthsBetween } from '../src/index.js'

/**
 * money-primitives' own tests of its guards and calendar, each worked by
 * hand (architecture-a-05). They were tested only through core, schema and
 * the parsers, where a mutant of basisPoints' negative guard, or of
 * isoDate's month check, survived every suite.
 */
describe('cents and basisPoints refuse what is not whole', () => {
  it('cents refuses a fraction and a number past the safe range', () => {
    expect(() => cents(12.5)).toThrow(RangeError)
    expect(() => cents(2 ** 53)).toThrow(RangeError)
    expect(cents(-1)).toBe(-1)
  })

  it('basisPoints refuses a fraction and a negative, and keeps 0', () => {
    expect(() => basisPoints(1.5)).toThrow(RangeError)
    expect(() => basisPoints(-1)).toThrow(RangeError)
    expect(basisPoints(0)).toBe(0)
  })
})

describe('isoDate', () => {
  it('refuses a month or a day the calendar does not have', () => {
    expect(() => isoDate('2026-13-01')).toThrow(RangeError)
    expect(() => isoDate('2026-00-01')).toThrow(RangeError)
    expect(() => isoDate('2026-02-29')).toThrow(RangeError)
    expect(() => isoDate('2026-9-1')).toThrow(RangeError)
    expect(isoDate('2028-02-29')).toBe('2028-02-29')
  })
})

describe('accrueMonthlyInterest', () => {
  it('rounds a month of APR / 12 half-up to the cent', () => {
    // $0.12 at 50%: 12 × 5,000 ÷ 120,000 = 0.5, half-up 1.
    expect(accrueMonthlyInterest(cents(12), basisPoints(5_000))).toBe(1)
    // $0.11: 0.458… rounds to 0.
    expect(accrueMonthlyInterest(cents(11), basisPoints(5_000))).toBe(0)
    expect(accrueMonthlyInterest(cents(-500), basisPoints(5_000))).toBe(0)
  })
})

describe('the calendar', () => {
  it('adds months as EDATE does, to the month’s last day when it is shorter', () => {
    expect(addMonths(isoDate('2025-01-31'), 1)).toBe('2025-02-28')
    expect(addMonths(isoDate('2024-01-31'), 1)).toBe('2024-02-29')
    expect(addMonths(isoDate('2025-03-01'), -3)).toBe('2024-12-01')
  })

  it('counts days and DATEDIF months', () => {
    expect(daysBetween(isoDate('2026-02-27'), isoDate('2026-03-01'))).toBe(2)
    expect(addDays(isoDate('2026-12-31'), 1)).toBe('2027-01-01')
    expect(monthsBetween(isoDate('2024-01-31'), isoDate('2024-02-29'))).toBe(0)
    expect(monthsBetween(isoDate('2024-01-08'), isoDate('2025-10-08'))).toBe(21)
    expect(() => monthsBetween(isoDate('2025-10-08'), isoDate('2024-01-08'))).toThrow(RangeError)
  })
})
