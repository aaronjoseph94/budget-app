import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { askWindow, type AskPeriod } from '../src/index.js'

/** Suite tests, worked by hand from F48 (docs/formula-decisions.md). Thursday 24 September 2026. */

const d = isoDate
const window = (period: AskPeriod, historyStart: string | null = '2026-06-01', readFrom = '2025-09-01') =>
  askWindow({ asOf: d('2026-09-24'), historyStart: historyStart === null ? null : d(historyStart), readFrom: d(readFrom), period })

describe('askWindow (F48)', () => {
  it('counts this month to today, against the same days of last month', () => {
    expect(window({ kind: 'this_month' })).toEqual({
      status: 'ready',
      now: { from: '2026-09-01', to: '2026-09-24' },
      before: { from: '2026-08-01', to: '2026-08-24' },
      cutFrom: null,
    })
  })

  it('counts a month that is over whole, against the whole month before', () => {
    expect(window({ kind: 'last_month' })).toMatchObject({ now: { from: '2026-08-01', to: '2026-08-31' }, before: { from: '2026-07-01', to: '2026-07-31' } })
    expect(window({ kind: 'month', month: 8, yearsBack: 0 })).toEqual(window({ kind: 'last_month' }))
  })

  it('counts a week from Monday to today, and last week Monday to Sunday', () => {
    expect(window({ kind: 'this_week' })).toMatchObject({ now: { from: '2026-09-21', to: '2026-09-24' }, before: { from: '2026-09-14', to: '2026-09-17' } })
    expect(window({ kind: 'last_week' })).toMatchObject({ now: { from: '2026-09-14', to: '2026-09-20' }, before: { from: '2026-09-07', to: '2026-09-13' } })
  })

  it('counts the three whole months before this one, against the three before them', () => {
    expect(window({ kind: 'last_three_months' }, '2026-01-01')).toEqual({
      status: 'ready',
      now: { from: '2026-06-01', to: '2026-08-31' },
      before: { from: '2026-03-01', to: '2026-05-31' },
      cutFrom: null,
    })
  })

  it('counts this year to today, and cuts it where the records start', () => {
    expect(window({ kind: 'this_year' }, '2025-01-01', '2025-01-01')).toMatchObject({
      now: { from: '2026-01-01', to: '2026-09-24' },
      before: { from: '2025-01-01', to: '2025-09-24' },
      cutFrom: null,
    })
    // Records from 1 June: the year is counted from there, with nothing before to compare.
    expect(window({ kind: 'this_year' })).toEqual({ status: 'ready', now: { from: '2026-06-01', to: '2026-09-24' }, before: null, cutFrom: '2026-06-01' })
  })

  it('leaves out the days before when they start before the records', () => {
    expect(window({ kind: 'this_month' }, '2026-08-08')).toMatchObject({ now: { from: '2026-09-01', to: '2026-09-24' }, before: null, cutFrom: null })
  })

  it('counts only the rows read: a month before the first day read is before the records', () => {
    expect(window({ kind: 'month', month: 7, yearsBack: 1 }, '2025-01-01')).toEqual({ status: 'before_records', coveredFrom: '2025-09-01' })
  })

  it('says a month still to come is not yet, and one before the records is before them', () => {
    expect(window({ kind: 'month', month: 12, yearsBack: 0 })).toEqual({ status: 'not_yet' })
    expect(window({ kind: 'month', month: 5, yearsBack: 0 })).toEqual({ status: 'before_records', coveredFrom: '2026-06-01' })
    expect(window({ kind: 'last_year' })).toEqual({ status: 'before_records', coveredFrom: '2026-06-01' })
    expect(window({ kind: 'this_month' }, null)).toEqual({ status: 'before_records', coveredFrom: null })
  })

  it('refuses a month that is not one', () => {
    expect(() => window({ kind: 'month', month: 13, yearsBack: 0 })).toThrow(RangeError)
  })
})
