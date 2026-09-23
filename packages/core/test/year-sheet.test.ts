import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import type { BudgetHistoryRow } from '../src/budgets.js'
import type { PeriodCategory, PeriodEntry } from '../src/period-sheet.js'
import { yearSheet, type YearSheetInput } from '../src/year-sheet.js'

/**
 * Suite tests, worked by hand from the invented rows below. Workbook's sample
 * types goals in January only, so its seven-month totals (D7) and Annual's
 * cached cells cannot tell a fixed total from a broken one; these can.
 */

const cat = (id: string, kind: PeriodCategory['kind']): PeriodCategory => ({ id, name: id, kind, sortOrder: 0 })
const CATEGORIES = [cat('pay', 'income'), cat('fund', 'savings'), cat('rent', 'bill'), cat('loan', 'debt'), cat('music', 'subscription'), cat('food', 'variable')]
const row = (postedOn: string, amountCents: number, categoryId: string): PeriodEntry => ({ postedOn: isoDate(postedOn), amountCents, categoryId })
const budget = (categoryId: string, month: string, budgetCents: number): BudgetHistoryRow => ({ categoryId, month: isoDate(month), applies: 'only', budgetCents })
const year = (over: Partial<YearSheetInput>) =>
  yearSheet({
    startMonth: isoDate('2026-01-01'),
    categories: CATEGORIES,
    budgetHistory: [],
    planHistory: [],
    entries: [],
    ...over,
  })

describe('yearSheet totals (suite, D7)', () => {
  it('adds all twelve months, where Workbook adds the first seven (Annual Budget!J9, V9, W9)', () => {
    const s = year({
      budgetHistory: [budget('pay', '2026-01-01', 100_000), budget('pay', '2026-08-01', 20_000), budget('fund', '2026-12-01', 5_000)],
      entries: [row('2026-02-10', -3_000, 'fund'), row('2026-10-10', -4_000, 'fund')],
    })
    expect(s.totals.income.budgetCents).toBe(120_000)
    expect(s.totals.savings.budgetCents).toBe(5_000)
    expect(s.totals.savings.actualCents).toBe(7_000)
  })

  it('totals expenses once, where Workbook runs on into the Subscriptions card (Annual Budget!P9, Q9)', () => {
    const s = year({
      budgetHistory: [budget('rent', '2026-03-01', 90_000), budget('music', '2026-03-01', 1_000)],
      entries: [row('2026-03-05', -1_000, 'music'), row('2026-04-05', -2_500, 'food'), row('2026-04-06', 500, 'food')],
    })
    // P9 would add the Subscriptions total (P29, 1,000) and March's row (P32, 1,000) again: 93,000.
    expect(s.totals.expenses.budgetCents).toBe(91_000)
    expect(s.totals.expenses.actualCents).toBe(3_000)
    expect(s.months[3]!.variable.actualCents).toBe(2_000)
    expect(s.months.map((m) => m.expenses.budgetCents).filter((c) => c !== 0)).toEqual([91_000])
  })
})

describe('yearSheet span (suite, F14)', () => {
  it('runs twelve months from a start in the middle of a year, into the next', () => {
    const s = year({
      startMonth: isoDate('2025-10-31'),
      entries: [row('2025-09-30', -100, 'food'), row('2026-02-28', -200, 'food'), row('2026-09-30', -300, 'food'), row('2026-10-01', -400, 'food')],
    })
    expect(s.startMonth).toBe('2025-10-01')
    expect(s.months.map((m) => m.month)).toEqual(
      ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => `${m}-01`),
    )
    expect(s.months[4]!.variable.actualCents).toBe(200)
    expect(s.totals.variable.actualCents).toBe(500)
  })
})
