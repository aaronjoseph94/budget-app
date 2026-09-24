import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { periodComparison, type PeriodComparisonInput } from '../src/compare.js'
import type { PeriodCategory } from '../src/period-sheet.js'

/** Suite tests for F25 and F26 over a week, a pay period and a Year, worked by hand. */

const d = isoDate
const cat = (id: string, kind: PeriodCategory['kind']): PeriodCategory => ({ id, name: id, kind, sortOrder: 0 })
const entry = (postedOn: string, amountCents: number, categoryId: string) => ({ postedOn: d(postedOn), amountCents, categoryId })
const rent = (effectiveMonth: string, plannedCents: number, dueDay = 1) => ({
  categoryId: 'rent',
  effectiveMonth: d(effectiveMonth),
  plannedCents,
  dueDay,
})
const BASE = {
  asOf: d('2026-09-24'),
  historyStart: d('2020-01-01'),
  categories: [cat('food', 'variable'), cat('rent', 'bill'), cat('fund', 'savings')],
  planHistory: [rent('2026-01-01', 80000), rent('2026-09-01', 90000)],
}
const compared = (input: PeriodComparisonInput) => {
  const c = periodComparison(input)
  if (c.status !== 'compared') throw new Error(`expected a comparison, got ${c.status}`)
  return c
}
const rowOf = (c: ReturnType<typeof compared>, kind: 'variable' | 'bill' | 'savings', id: string) =>
  c.blocks[kind].rows.find((r) => r.categoryId === id)

describe('periodComparison for a week (F25, F26)', () => {
  it('sets Monday to today against the same weekdays a week before', () => {
    const c = compared({
      ...BASE,
      period: 'week',
      week: d('2026-09-24'),
      entries: [
        entry('2026-09-22', -4000, 'food'),
        entry('2026-09-15', -6500, 'food'),
        // Friday the 18th is past the earlier window's Thursday.
        entry('2026-09-18', -9000, 'food'),
      ],
    })
    expect(c.now).toEqual({ from: '2026-09-21', to: '2026-09-24' })
    // 2,500 × 10,000 ÷ 6,500 = 3846.15.
    expect(c.summary.spent).toMatchObject({ nowCents: 4000, beforeCents: 6500, changeCents: -2500, changeBp: -3846, direction: 'less' })
  })

  it('counts a bill due on the 1st in a week across a month end at that month’s amount', () => {
    // 31 Aug – 6 Sep holds 1 September, at September's 90,000; the week before holds no 1st.
    const c = compared({ ...BASE, period: 'week', week: d('2026-09-01'), entries: [] })
    expect(rowOf(c, 'bill', 'rent')).toMatchObject({ nowCents: 90000, beforeCents: 0, changeBp: null })
  })
})

describe('periodComparison for a pay period (F25, F26)', () => {
  const schedule = { firstPayDate: d('2026-08-21'), frequency: 'biweekly' as const }

  it('counts each side’s own payday month’s share, whatever the due day, as the Paycheck does', () => {
    // 18–24 Sep against 4–10 Sep, both paid in September: 90,000 × 12 ÷ 26 = 41,538.46, so 41,538.
    const c = compared({ ...BASE, period: 'pay', schedule, day: d('2026-09-24'), entries: [entry('2026-09-19', -3000, 'food')] })
    expect(c.before).toEqual({ from: '2026-09-04', to: '2026-09-10' })
    expect(rowOf(c, 'bill', 'rent')).toMatchObject({ nowCents: 41538, beforeCents: 41538, direction: 'same' })
    expect(rowOf(c, 'variable', 'food')).toMatchObject({ nowCents: 3000, beforeCents: 0 })
    // 4–17 Sep against 21 Aug – 3 Sep: September's share against August's, 80,000 × 12 ÷ 26 = 36,923.08.
    const over = compared({ ...BASE, period: 'pay', schedule, day: d('2026-09-10'), entries: [] })
    expect(rowOf(over, 'bill', 'rent')).toMatchObject({ nowCents: 41538, beforeCents: 36923, changeCents: 4615 })
  })
})

describe('periodComparison for a Year (F25, F26)', () => {
  it('counts month by month, each month’s own amount, and this month’s bill only on its due day', () => {
    // The rent is due on the 25th. 1 Jan – 24 Sep 2026: eight whole months at
    // 2026's 80,000, and September's days before its due day. The same days
    // of 2025: eight whole months at 2025's 70,000, and none in September.
    const planHistory = [rent('2025-01-01', 70000, 25), rent('2026-01-01', 80000, 25), rent('2026-09-01', 90000, 25)]
    const c = compared({
      ...BASE,
      planHistory,
      period: 'year',
      startMonth: d('2026-01-01'),
      entries: [entry('2026-02-10', -1000, 'fund'), entry('2025-09-24', -2500, 'food'), entry('2025-09-25', -9999, 'food')],
    })
    expect(c.before).toEqual({ from: '2025-01-01', to: '2025-09-24' })
    // 8 × 80,000 against 8 × 70,000.
    expect(rowOf(c, 'bill', 'rent')).toMatchObject({ nowCents: 640000, beforeCents: 560000, changeCents: 80000 })
    expect(rowOf(c, 'variable', 'food')).toMatchObject({ nowCents: 0, beforeCents: 2500 })
    expect(c.summary.saved).toMatchObject({ nowCents: 1000, beforeCents: 0, meaning: 'good' })
    expect(c.summary.spent).toMatchObject({ nowCents: 640000, beforeCents: 562500 })
  })

  it('compares nothing when the year before lies before the records', () => {
    expect(
      periodComparison({ ...BASE, historyStart: d('2026-08-08'), period: 'year', startMonth: d('2026-01-01'), entries: [] }),
    ).toMatchObject({ status: 'before_records', historyStart: '2026-08-08' })
  })
})
