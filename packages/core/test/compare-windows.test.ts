import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { comparisonWindow } from '../src/compare.js'
import type { PaySchedule } from '../src/pay-period.js'

/** Suite tests for F25's week, pay period and Year, worked by hand (docs/formula-decisions.md). */

const EARLY = isoDate('2020-01-01')
const d = isoDate
const window = (from: string, to: string) => ({ from, to })

describe('comparisonWindow for a week (F25)', () => {
  const week = (day: string, asOf: string, historyStart: string | null = EARLY) =>
    comparisonWindow({ period: 'week', week: d(day), asOf: d(asOf), historyStart: historyStart === null ? null : d(historyStart) })

  it('sets Monday to Thursday 24 September against the same weekdays a week earlier', () => {
    expect(week('2026-09-24', '2026-09-24')).toEqual({
      status: 'compared',
      sameDays: true,
      now: window('2026-09-21', '2026-09-24'),
      before: window('2026-09-14', '2026-09-17'),
    })
    // Named by any of its days.
    expect(week('2026-09-27', '2026-09-24')).toEqual(week('2026-09-21', '2026-09-24'))
  })

  it('sets a week already over whole against the whole week before, across a month end', () => {
    expect(week('2026-09-01', '2026-09-24')).toEqual({
      status: 'compared',
      sameDays: false,
      now: window('2026-08-31', '2026-09-06'),
      before: window('2026-08-24', '2026-08-30'),
    })
  })

  it('compares nothing for a week not begun, or one whose week before starts before the records', () => {
    expect(week('2026-09-28', '2026-09-24')).toEqual({ status: 'not_started' })
    expect(week('2026-09-24', '2026-09-24', '2026-09-15')).toEqual({
      status: 'before_records',
      now: window('2026-09-21', '2026-09-24'),
      before: window('2026-09-14', '2026-09-17'),
      historyStart: '2026-09-15',
    })
    expect(week('2026-09-24', '2026-09-24', '2026-09-14')).toMatchObject({ status: 'compared' })
  })
})

describe('comparisonWindow for a pay period (F25)', () => {
  const biweekly: PaySchedule = { firstPayDate: d('2026-09-18'), frequency: 'biweekly' }
  const monthly: PaySchedule = { firstPayDate: d('2026-01-01'), frequency: 'monthly' }
  const pay = (schedule: PaySchedule, day: string, asOf: string, historyStart: string = EARLY) =>
    comparisonWindow({ period: 'pay', schedule, day: d(day), asOf: d(asOf), historyStart: d(historyStart) })

  it('sets the payday to today against the payday before plus the same number of days', () => {
    expect(pay(biweekly, '2026-09-24', '2026-09-24')).toEqual({
      status: 'compared',
      sameDays: true,
      now: window('2026-09-18', '2026-09-24'),
      before: window('2026-09-04', '2026-09-10'),
    })
  })

  it('caps the earlier window at its period’s last day', () => {
    // 31 March is 30 days on from the 1st; 1 February plus 30 days is 3 March.
    expect(pay(monthly, '2027-03-31', '2027-03-31')).toMatchObject({
      now: window('2027-03-01', '2027-03-31'),
      before: window('2027-02-01', '2027-02-28'),
    })
    // On a short period's last day it is still running: 28 days against 28.
    expect(pay(monthly, '2027-02-28', '2027-02-28')).toMatchObject({
      sameDays: true,
      now: window('2027-02-01', '2027-02-28'),
      before: window('2027-01-01', '2027-01-28'),
    })
  })

  it('sets a period already over whole against the whole one before, and none for one not begun', () => {
    expect(pay(biweekly, '2026-09-10', '2026-09-24')).toEqual({
      status: 'compared',
      sameDays: false,
      now: window('2026-09-04', '2026-09-17'),
      before: window('2026-08-21', '2026-09-03'),
    })
    expect(pay(biweekly, '2026-10-02', '2026-09-24')).toEqual({ status: 'not_started' })
  })

  it('compares nothing when the period before starts before the records', () => {
    expect(pay(biweekly, '2026-09-24', '2026-09-24', '2026-09-05')).toMatchObject({
      status: 'before_records',
      historyStart: '2026-09-05',
    })
  })
})

describe('comparisonWindow for a Year (F25)', () => {
  const year = (startMonth: string, asOf: string, historyStart: string = EARLY) =>
    comparisonWindow({ period: 'year', startMonth: d(startMonth), asOf: d(asOf), historyStart: d(historyStart) })

  it('sets a running Year’s days so far against the same days a year earlier', () => {
    expect(year('2026-01-01', '2026-09-24')).toEqual({
      status: 'compared',
      sameDays: true,
      now: window('2026-01-01', '2026-09-24'),
      before: window('2025-01-01', '2025-09-24'),
    })
    // Named by any day of its first month; a missing 29 February ends on the 28th.
    expect(year('2027-03-15', '2028-02-29')).toMatchObject({
      now: window('2027-03-01', '2028-02-29'),
      before: window('2026-03-01', '2027-02-28'),
    })
  })

  it('sets a Year already over against the twelve months before it, and none for one not begun', () => {
    expect(year('2025-03-01', '2026-09-24')).toEqual({
      status: 'compared',
      sameDays: false,
      now: window('2025-03-01', '2026-02-28'),
      before: window('2024-03-01', '2025-02-28'),
    })
    expect(year('2026-10-01', '2026-09-24')).toEqual({ status: 'not_started' })
  })

  it('compares nothing when a year earlier lies before the records (F24)', () => {
    expect(year('2026-01-01', '2026-09-24', '2026-08-08')).toEqual({
      status: 'before_records',
      now: window('2026-01-01', '2026-09-24'),
      before: window('2025-01-01', '2025-09-24'),
      historyStart: '2026-08-08',
    })
  })
})
