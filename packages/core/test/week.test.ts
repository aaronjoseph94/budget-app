import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { monthBounds, shiftMonth, shiftWeek, weekBounds } from '../src/week.js'

/**
 * Not workbook-derived: the workbook has no weekly view (docs/ROADMAP.md makes
 * weekly the primary lens as a new capability). Expected values are worked by
 * hand from the invented rows below, so a reader can check each one.
 */

describe('weekBounds', () => {
  it('starts on Monday and ends on Sunday', () => {
    // 2026-09-22 is a Tuesday.
    expect(weekBounds(isoDate('2026-09-22'))).toEqual({ start: '2026-09-21', end: '2026-09-27' })
  })

  it('treats Monday as the first day of its own week', () => {
    expect(weekBounds(isoDate('2026-09-21')).start).toBe('2026-09-21')
  })

  it('treats Sunday as the last day of the week before', () => {
    // A Sunday-first week would put this in a new week and split the weekend.
    expect(weekBounds(isoDate('2026-09-27'))).toEqual({ start: '2026-09-21', end: '2026-09-27' })
  })

  it('steps whole weeks, across a year boundary', () => {
    expect(shiftWeek(isoDate('2026-12-28'), 1)).toBe('2027-01-04')
    expect(shiftWeek(isoDate('2026-09-21'), -1)).toBe('2026-09-14')
  })

  it('crosses a month and a year boundary', () => {
    // 2027-01-01 is a Friday.
    expect(weekBounds(isoDate('2027-01-01'))).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })
})

describe('monthBounds', () => {
  it('spans the first to the last day', () => {
    expect(monthBounds(isoDate('2026-09-22'))).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })

  it('knows February in a leap year and out of one', () => {
    expect(monthBounds(isoDate('2028-02-10')).end).toBe('2028-02-29')
    expect(monthBounds(isoDate('2027-02-10')).end).toBe('2027-02-28')
  })

  it('steps whole months from the first, never skipping a short one', () => {
    // From the 31st, "one month on" lands in March and skips February; the
    // ledger steps from the 1st so every month is visited.
    expect(shiftMonth(isoDate('2026-01-31'), 1)).toBe('2026-02-01')
    expect(shiftMonth(isoDate('2026-01-15'), -1)).toBe('2025-12-01')
  })
})

// Testing fuzz-07: money-primitives read years 0 to 99 as 1900 to 1999, so
// a week in year 25 was found in 1925, and its month ran to 1925.
describe('a week and a month long ago', () => {
  it('are found in their own year', () => {
    expect(weekBounds(isoDate('0025-03-15'))).toEqual({ start: '0025-03-10', end: '0025-03-16' })
    expect(monthBounds(isoDate('0025-03-15'))).toEqual({ start: '0025-03-01', end: '0025-03-31' })
  })
})
