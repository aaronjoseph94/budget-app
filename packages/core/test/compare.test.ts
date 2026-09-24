import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { comparisonWindow } from '../src/compare.js'

/** Suite tests, worked by hand from F24 and F25 (docs/formula-decisions.md). */

const EARLY = isoDate('2020-01-01')
const monthWindow = (month: string, asOf: string, historyStart: string | null = EARLY) =>
  comparisonWindow({
    period: 'month',
    month: isoDate(month),
    asOf: isoDate(asOf),
    historyStart: historyStart === null ? null : isoDate(historyStart),
  })
const window = (from: string, to: string) => ({ from, to })

describe('comparisonWindow for a month (F25)', () => {
  it('sets 1–24 September against 1–24 August on 24 September', () => {
    expect(monthWindow('2026-09-01', '2026-09-24')).toEqual({
      status: 'compared',
      sameDays: true,
      now: window('2026-09-01', '2026-09-24'),
      before: window('2026-08-01', '2026-08-24'),
    })
  })

  it('names the month by any of its days', () => {
    expect(monthWindow('2026-09-15', '2026-09-24')).toEqual(monthWindow('2026-09-01', '2026-09-24'))
  })

  it('ends the earlier window with its month: 31 March against 1–28 February, and 29 in a leap year', () => {
    expect(monthWindow('2027-03-01', '2027-03-31')).toMatchObject({
      now: window('2027-03-01', '2027-03-31'),
      before: window('2027-02-01', '2027-02-28'),
    })
    expect(monthWindow('2028-03-01', '2028-03-30')).toMatchObject({ before: window('2028-02-01', '2028-02-29') })
  })

  it('sets a month already over whole against the whole month before', () => {
    expect(monthWindow('2026-08-01', '2026-09-24')).toEqual({
      status: 'compared',
      sameDays: false,
      now: window('2026-08-01', '2026-08-31'),
      before: window('2026-07-01', '2026-07-31'),
    })
  })

  it('compares nothing for a month not started yet', () => {
    expect(monthWindow('2026-10-01', '2026-09-24')).toEqual({ status: 'not_started' })
  })

  it('compares nothing when the earlier window starts before the records, and says where they start (F24)', () => {
    expect(monthWindow('2026-09-01', '2026-09-24', '2026-08-08')).toEqual({
      status: 'before_records',
      now: window('2026-09-01', '2026-09-24'),
      before: window('2026-08-01', '2026-08-24'),
      historyStart: '2026-08-08',
    })
    expect(monthWindow('2026-09-01', '2026-09-24', null)).toMatchObject({ status: 'before_records', historyStart: null })
  })

  it('compares a window that starts on the first day of the records', () => {
    expect(monthWindow('2026-09-01', '2026-09-24', '2026-08-01')).toMatchObject({ status: 'compared' })
  })
})
