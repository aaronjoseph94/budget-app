import { describe, expect, it } from 'vitest'
import { isoDate, monthsBetween } from '@budget/money-primitives'

/**
 * Suite, not External: DATEDIF "M" worked by hand. Workbook's one cached month
 * count (Savings!V14 = 21) is asserted through savingsFundPlan in the
 * workbook-savings golden; these pin the edges the sample never reaches.
 * Lives with core's tests because money-primitives has no test project of
 * its own and may import nothing, vitest included.
 */
const between = (from: string, to: string) => monthsBetween(isoDate(from), isoDate(to))

describe('monthsBetween, as DATEDIF(from, to, "M")', () => {
  it('counts whole months when the day of the month matches', () => {
    expect(between('2024-01-08', '2025-10-08')).toBe(21)
    expect(between('2026-09-23', '2026-10-23')).toBe(1)
  })

  it('is one fewer when the later day of the month is earlier', () => {
    // A day short of Savings!V14's 21.
    expect(between('2024-01-08', '2025-10-07')).toBe(20)
    expect(between('2026-09-23', '2026-10-22')).toBe(0)
  })

  it('is not moved by a later day of the month', () => {
    expect(between('2026-09-01', '2026-10-31')).toBe(1)
  })

  it('does not treat the last day of a short month as a whole month from the 31st', () => {
    // DATEDIF compares days of the month only: Feb 29 is before Jan 31's 31.
    expect(between('2024-01-31', '2024-02-29')).toBe(0)
    expect(between('2024-01-31', '2024-03-31')).toBe(2)
    expect(between('2024-01-31', '2024-04-30')).toBe(2)
  })

  it('is 0 from a day to itself, and within one month', () => {
    expect(between('2026-09-23', '2026-09-23')).toBe(0)
    expect(between('2026-09-01', '2026-09-30')).toBe(0)
  })

  it('crosses year ends', () => {
    expect(between('2025-12-15', '2026-01-15')).toBe(1)
    expect(between('2025-12-15', '2026-01-14')).toBe(0)
    expect(between('2020-02-29', '2030-02-28')).toBe(119)
  })

  it('refuses a later date first, where DATEDIF gives #NUM!', () => {
    expect(() => between('2025-10-08', '2024-01-08')).toThrow(RangeError)
    expect(() => between('2026-09-23', '2026-09-22')).toThrow(RangeError)
  })
})
