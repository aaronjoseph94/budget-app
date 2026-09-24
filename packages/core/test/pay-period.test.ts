import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { payPeriod, payShare, shiftPayPeriod, type PayFrequency } from '../src/pay-period.js'

/**
 * Suite, not External: the workbook's Paycheck tab types its dates and never reads
 * a pay schedule (D18), so no cached cell holds a period found from one or a
 * share split by frequency. Every value is worked by hand below, from F15.
 */

const schedule = (firstPayDate: string, frequency: PayFrequency) => ({ firstPayDate: isoDate(firstPayDate), frequency })
const period = (first: string, frequency: PayFrequency, asOf: string) =>
  payPeriod({ schedule: schedule(first, frequency), asOf: isoDate(asOf) })

describe('payPeriod, bi-weekly', () => {
  // 2026-09-11 is a Friday; paydays every 14 days from it.
  it('runs from a payday to the day before the next', () => {
    expect(period('2026-09-11', 'biweekly', '2026-09-23')).toEqual({ start: '2026-09-11', end: '2026-09-24' })
  })

  it('starts on the payday itself, and the day before belongs to the period before', () => {
    expect(period('2026-09-11', 'biweekly', '2026-09-25')).toEqual({ start: '2026-09-25', end: '2026-10-08' })
    expect(period('2026-09-11', 'biweekly', '2026-09-24')).toEqual({ start: '2026-09-11', end: '2026-09-24' })
  })

  it('runs back past the first payday on the same schedule (F15)', () => {
    // 10 days before 11 September: the period from 28 August.
    expect(period('2026-09-11', 'biweekly', '2026-09-01')).toEqual({ start: '2026-08-28', end: '2026-09-10' })
  })

  it('crosses a year end', () => {
    expect(period('2026-12-25', 'biweekly', '2027-01-05')).toEqual({ start: '2026-12-25', end: '2027-01-07' })
  })
})

describe('payPeriod, weekly', () => {
  it('is seven days from the payday', () => {
    // 19 days after Friday 4 September: the third week, from Friday the 18th.
    expect(period('2026-09-04', 'weekly', '2026-09-23')).toEqual({ start: '2026-09-18', end: '2026-09-24' })
  })

  it('runs back past the first payday', () => {
    expect(period('2026-09-04', 'weekly', '2026-09-03')).toEqual({ start: '2026-08-28', end: '2026-09-03' })
  })
})

describe('payPeriod, monthly', () => {
  it("is from the payday's day of one month to the day before it in the next", () => {
    expect(period('2026-01-15', 'monthly', '2026-09-23')).toEqual({ start: '2026-09-15', end: '2026-10-14' })
    expect(period('2026-01-15', 'monthly', '2026-09-10')).toEqual({ start: '2026-08-15', end: '2026-09-14' })
  })

  it('pays a day the month lacks on its last day (D6), and keeps the day after', () => {
    // First paid 31 January: 28 February, then 31 March again, not the 28th.
    expect(period('2025-01-31', 'monthly', '2025-02-27')).toEqual({ start: '2025-01-31', end: '2025-02-27' })
    expect(period('2025-01-31', 'monthly', '2025-03-01')).toEqual({ start: '2025-02-28', end: '2025-03-30' })
    expect(period('2025-01-31', 'monthly', '2025-04-30')).toEqual({ start: '2025-04-30', end: '2025-05-30' })
  })

  it('finds 29 February in a leap year', () => {
    expect(period('2024-01-30', 'monthly', '2024-03-01')).toEqual({ start: '2024-02-29', end: '2024-03-29' })
  })

  it('runs back past the first payday, clamping there too', () => {
    // First paid 31 March; a month back is 28 February, which is after the 15th.
    expect(period('2026-03-31', 'monthly', '2026-02-15')).toEqual({ start: '2026-01-31', end: '2026-02-27' })
  })
})

describe('shiftPayPeriod', () => {
  const step = (first: string, frequency: PayFrequency, asOf: string, periods: number) =>
    shiftPayPeriod({ schedule: schedule(first, frequency), asOf: isoDate(asOf), periods })

  it('steps whole periods from the one holding asOf', () => {
    expect(step('2026-09-11', 'biweekly', '2026-09-23', 1)).toEqual({ start: '2026-09-25', end: '2026-10-08' })
    expect(step('2026-09-11', 'biweekly', '2026-09-23', -1)).toEqual({ start: '2026-08-28', end: '2026-09-10' })
    expect(step('2026-09-04', 'weekly', '2026-09-23', -2)).toEqual({ start: '2026-09-04', end: '2026-09-10' })
  })

  it("steps monthly periods by the first payday's day, not the last one's", () => {
    expect(step('2025-01-31', 'monthly', '2025-02-10', 1)).toEqual({ start: '2025-02-28', end: '2025-03-30' })
    expect(step('2025-01-31', 'monthly', '2025-02-10', 2)).toEqual({ start: '2025-03-31', end: '2025-04-29' })
  })

  it('is the same period for no step', () => {
    expect(step('2026-01-15', 'monthly', '2026-09-23', 0)).toEqual({ start: '2026-09-15', end: '2026-10-14' })
  })
})

describe('payShare (F15: × 12 ÷ paydays a year, half-up to the cent)', () => {
  const share = (monthlyCents: number, frequency: PayFrequency) => payShare({ monthlyCents, frequency })

  it("gives the owner's example: $1,600 rent is $738.46 a bi-weekly period", () => {
    // 160000 × 12 ÷ 26 = 73846.15…
    expect(share(160_000, 'biweekly')).toBe(73_846)
  })

  it('divides by 52 for weekly pay, and not at all for monthly', () => {
    // 160000 × 12 ÷ 52 = 36923.08…
    expect(share(160_000, 'weekly')).toBe(36_923)
    expect(share(160_000, 'monthly')).toBe(160_000)
  })

  it('rounds to the nearest cent, up as well as down', () => {
    // 1700 × 12 ÷ 26 = 784.62 → 785; 1799 × 12 ÷ 26 = 830.31 → 830.
    expect(share(1_700, 'biweekly')).toBe(785)
    expect(share(1_799, 'biweekly')).toBe(830)
    // 2 × 12 ÷ 26 = 0.92 → 1; 1 × 12 ÷ 26 = 0.46 → 0.
    expect(share(2, 'biweekly')).toBe(1)
    expect(share(1, 'biweekly')).toBe(0)
  })

  it('is exact past what a double holds as an integer', () => {
    // 900719925474099 × 12 = 10808639105689188, above 2^53; ÷ 52 = 207858444340176.69…
    expect(share(900_719_925_474_099, 'weekly')).toBe(207_858_444_340_177)
  })

  it('refuses a negative amount or a fraction of a cent', () => {
    expect(() => share(-100, 'weekly')).toThrow(RangeError)
    expect(() => share(10.5, 'weekly')).toThrow(RangeError)
  })
})
