import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { comparisonWindow, periodComparison, type PeriodComparisonInput } from '../src/compare.js'
import type { PeriodCategory } from '../src/period-sheet.js'

/** Suite tests, worked by hand from F24, F25 and F26 (docs/formula-decisions.md). */

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

const cat = (id: string, kind: PeriodCategory['kind'], sortOrder = 0): PeriodCategory => ({ id, name: id, kind, sortOrder })
const entry = (postedOn: string, amountCents: number, categoryId: string) => ({ postedOn: isoDate(postedOn), amountCents, categoryId })
const rent = (effectiveMonth: string, plannedCents: number) => ({
  categoryId: 'rent',
  effectiveMonth: isoDate(effectiveMonth),
  plannedCents,
  dueDay: 28,
})
type MonthInput = Extract<PeriodComparisonInput, { readonly period: 'month' }>
const INPUT: MonthInput = {
  period: 'month',
  month: isoDate('2026-09-01'),
  asOf: isoDate('2026-09-24'),
  historyStart: EARLY,
  categories: [cat('food', 'variable'), cat('gifts', 'variable', 1), cat('rent', 'bill'), cat('pay', 'income'), cat('fund', 'savings')],
  planHistory: [rent('2026-01-01', 80000)],
  entries: [
    entry('2026-07-10', -100000, 'food'),
    entry('2026-08-10', -118000, 'food'),
    // After 24 August: outside the earlier window while September runs.
    entry('2026-08-25', -5000, 'food'),
    entry('2026-08-15', 250000, 'pay'),
    entry('2026-08-16', -30000, 'fund'),
    entry('2026-08-20', -1000, 'gifts'),
    entry('2026-09-03', -102000, 'food'),
    entry('2026-09-15', 200000, 'pay'),
    entry('2026-09-16', -45000, 'fund'),
    entry('2026-09-21', -1099, 'gifts'),
    // Past today: in neither window.
    entry('2026-09-26', -7000, 'food'),
  ],
}
const compared = (input: Partial<MonthInput> = {}) => {
  const c = periodComparison({ ...INPUT, ...input })
  if (c.status !== 'compared') throw new Error(`expected a comparison, got ${c.status}`)
  return c
}
const row = (c: ReturnType<typeof compared>, kind: keyof ReturnType<typeof compared>['blocks'], id: string) =>
  c.blocks[kind].rows.find((r) => r.categoryId === id)

describe('periodComparison (F26)', () => {
  it('sets 1–24 September against 1–24 August, with the change, percentage, direction and meaning', () => {
    const c = compared()
    expect(c.now).toEqual(window('2026-09-01', '2026-09-24'))
    expect(c.before).toEqual(window('2026-08-01', '2026-08-24'))
    // Food 102,000 + gifts 1,099 against 118,000 + 1,000. Rent, due on the
    // 28th, counts on neither side (F8). 15,901 × 10,000 ÷ 119,000 = 1336.2.
    expect(c.summary.spent).toEqual({
      nowCents: 103099, beforeCents: 119000, changeCents: -15901, changeBp: -1336, direction: 'less', meaning: 'good',
    })
    // 16,000 × 10,000 ÷ 118,000 = 1355.93, half-up.
    expect(row(c, 'variable', 'food')).toMatchObject({ changeCents: -16000, changeBp: -1356, direction: 'less', meaning: 'good' })
    expect(c.blocks.variable.total).toMatchObject({ nowCents: 103099, beforeCents: 119000, changeCents: -15901 })
    // Less pay is to watch, more saved is good.
    expect(c.summary.income).toMatchObject({ changeCents: -50000, changeBp: -2000, direction: 'less', meaning: 'watch' })
    expect(c.summary.saved).toMatchObject({ changeCents: 15000, changeBp: 5000, direction: 'more', meaning: 'good' })
    expect(row(c, 'income', 'pay')).toMatchObject({ direction: 'less', meaning: 'watch' })
    expect(c.blocks.savings.total).toMatchObject({ direction: 'more', meaning: 'good' })
    expect(row(c, 'bill', 'rent')).toMatchObject({ nowCents: 0, beforeCents: 0, direction: 'same', meaning: 'neutral' })
  })

  it('calls 99 cents either way the same', () => {
    expect(row(compared(), 'variable', 'gifts')).toMatchObject({ changeCents: 99, direction: 'same', meaning: 'neutral' })
  })

  it('gives no percentage against $0, only the amount', () => {
    const c = compared({ entries: [entry('2026-09-03', -2500, 'food')] })
    expect(row(c, 'variable', 'food')).toEqual({
      categoryId: 'food', nowCents: 2500, beforeCents: 0, changeCents: 2500, changeBp: null, direction: 'more', meaning: 'watch',
    })
  })

  it('counts a bill due on the 28th from the 28th on, on both sides, at each month\'s amount', () => {
    const raised = { planHistory: [rent('2026-01-01', 80000), rent('2026-09-01', 85000)] }
    expect(row(compared({ ...raised, asOf: isoDate('2026-09-27') }), 'bill', 'rent')).toMatchObject({ nowCents: 0, beforeCents: 0 })
    // 5,000 × 10,000 ÷ 80,000 = 625.
    expect(row(compared({ ...raised, asOf: isoDate('2026-09-28') }), 'bill', 'rent')).toMatchObject({
      nowCents: 85000, beforeCents: 80000, changeCents: 5000, changeBp: 625, direction: 'more', meaning: 'watch',
    })
  })

  it('sets a month already over whole against the whole month before', () => {
    const c = compared({ month: isoDate('2026-08-01') })
    // August 118,000 + 5,000 against July 100,000; rent in both, whole months (F8).
    expect(row(c, 'variable', 'food')).toMatchObject({ nowCents: 123000, beforeCents: 100000, changeBp: 2300 })
    expect(row(c, 'bill', 'rent')).toMatchObject({ nowCents: 80000, beforeCents: 80000, direction: 'same' })
  })

  it('compares nothing when the earlier window starts before the records, or the month has not begun', () => {
    expect(periodComparison({ ...INPUT, historyStart: isoDate('2026-08-08') })).toEqual({
      status: 'before_records',
      now: window('2026-09-01', '2026-09-24'),
      before: window('2026-08-01', '2026-08-24'),
      historyStart: '2026-08-08',
    })
    expect(periodComparison({ ...INPUT, month: isoDate('2026-10-01') })).toEqual({ status: 'not_started' })
  })
})
