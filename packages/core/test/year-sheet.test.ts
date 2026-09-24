import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import type { BudgetHistoryRow } from '../src/budgets.js'
import type { PeriodCategory, PeriodEntry } from '../src/period-sheet.js'
import type { PlanHistoryRow } from '../src/plans.js'
import { yearSheet, type YearSheetInput } from '../src/year-sheet.js'

/**
 * Suite tests, worked by hand from the invented rows below. The workbook's sample
 * types goals in January only, so its seven-month totals (D7) and Annual's
 * cached cells cannot tell a fixed total from a broken one; these can.
 */

const cat = (id: string, kind: PeriodCategory['kind']): PeriodCategory => ({ id, name: id, kind, sortOrder: 0 })
const CATEGORIES = [cat('pay', 'income'), cat('fund', 'savings'), cat('rent', 'bill'), cat('loan', 'debt'), cat('music', 'subscription'), cat('food', 'variable')]
const row = (postedOn: string, amountCents: number, categoryId: string): PeriodEntry => ({ postedOn: isoDate(postedOn), amountCents, categoryId })
const budget = (categoryId: string, month: string, budgetCents: number): BudgetHistoryRow => ({ categoryId, month: isoDate(month), applies: 'only', budgetCents })
const plan = (categoryId: string, effectiveMonth: string, plannedCents: number): PlanHistoryRow => ({ categoryId, effectiveMonth: isoDate(effectiveMonth), plannedCents, dueDay: 1 })
const year = (over: Partial<YearSheetInput>) =>
  yearSheet({
    startMonth: isoDate('2026-01-01'),
    asOf: isoDate('2026-12-31'),
    categories: CATEGORIES,
    budgetHistory: [],
    planHistory: [],
    entries: [],
    startingBalances: [],
    ...over,
  })

describe('yearSheet totals (suite, D7)', () => {
  it('adds all twelve months, where the workbook adds the first seven (Annual Budget!J9, V9, W9)', () => {
    const s = year({
      budgetHistory: [budget('pay', '2026-01-01', 100_000), budget('pay', '2026-08-01', 20_000), budget('fund', '2026-12-01', 5_000)],
      entries: [row('2026-02-10', -3_000, 'fund'), row('2026-10-10', -4_000, 'fund')],
    })
    expect(s.totals.income.budgetCents).toBe(120_000)
    expect(s.totals.savings.budgetCents).toBe(5_000)
    expect(s.totals.savings.actualCents).toBe(7_000)
  })

  it('totals expenses once, where the workbook runs on into the Subscriptions card (Annual Budget!P9, Q9)', () => {
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

describe('yearSheet gate (suite, F10)', () => {
  const plans = [plan('rent', '2026-01-01', 80_000), plan('music', '2026-01-01', 1_000)]

  it('counts planned bills up to and including the month of asOf, and none after', () => {
    const s = year({ asOf: isoDate('2026-04-17'), planHistory: plans })
    expect(s.months.map((m) => m.bill.actualCents)).toEqual([80_000, 80_000, 80_000, 80_000, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(s.months.map((m) => m.countsPlanned).lastIndexOf(true)).toBe(3)
    expect(s.totals.expenses.actualCents).toBe(4 * 81_000)
  })

  it('still counts a real row after asOf, and lets a real row replace its plan before it (D5)', () => {
    const s = year({
      asOf: isoDate('2026-02-01'),
      planHistory: plans,
      entries: [row('2026-02-03', -1_299, 'music'), row('2026-06-03', -1_000, 'music')],
    })
    expect(s.months.slice(0, 6).map((m) => m.subscription.actualCents)).toEqual([1_000, 1_299, 0, 0, 0, 1_000])
  })

  it('counts no plan when the whole Year is after asOf, and still refuses one naming an unknown category', () => {
    expect(year({ asOf: isoDate('2025-12-31'), planHistory: plans }).totals.bill.actualCents).toBe(0)
    expect(() => year({ asOf: isoDate('2025-12-31'), planHistory: [plan('gone', '2026-01-01', 1)] })).toThrow(/category gone/)
  })
})

describe('yearSheet span and balances (suite, F14, F12)', () => {
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

  it('reads the start month balance and ends at start + income − expenses − savings', () => {
    const s = year({
      startingBalances: [
        { month: isoDate('2026-02-01'), cents: 999_999 },
        { month: isoDate('2026-01-01'), cents: 100_000 },
      ],
      entries: [row('2026-01-02', 300_000, 'pay'), row('2026-05-02', -120_000, 'food'), row('2026-07-02', -50_000, 'fund')],
    })
    expect(s.startingBalanceCents).toBe(100_000)
    expect(s.endingBalanceCents).toBe(230_000)
  })

  it('has no ending balance with no start typed, and refuses a start that 0010 would', () => {
    const s = year({ entries: [row('2026-01-02', 300_000, 'pay')] })
    expect(s.startingBalanceCents).toBeNull()
    expect(s.endingBalanceCents).toBeNull()
    const typed = (month: string, cents: number) => ({ month: isoDate(month), cents })
    expect(() => year({ startingBalances: [typed('2026-01-02', 1)] })).toThrow(/first day/)
    expect(() => year({ startingBalances: [typed('2026-03-01', 1), typed('2026-03-01', 2)] })).toThrow(/Two starting/)
    expect(() => year({ startingBalances: [typed('2026-01-01', 1.5)] })).toThrow(RangeError)
  })
})

describe('yearSheet Left over and at a glance (suite, F12, F18)', () => {
  const ranked = (id: string, kind: PeriodCategory['kind'], sortOrder: number): PeriodCategory => ({ id, name: id, kind, sortOrder })
  const CATS = [
    ranked('pay', 'income', 0),
    ranked('fund', 'savings', 0),
    ranked('gas', 'variable', 1),
    ranked('eat', 'variable', 0),
    ranked('back', 'variable', 2),
    ranked('rent', 'bill', 0),
    ranked('loan', 'debt', 0),
    ranked('music', 'subscription', 0),
  ]
  const top = (s: ReturnType<typeof year>) => s.atAGlance.top3.map((t) => [t.categoryId, t.amountCents, t.shareBp])

  it('leaves income − expenses − savings over, below zero when more went out than came in', () => {
    const entries = [row('2026-01-02', 300_000, 'pay'), row('2026-05-02', -120_000, 'food'), row('2026-07-02', -50_000, 'fund')]
    expect(year({ entries }).leftOverCents).toBe(130_000)
    expect(year({ entries: [...entries, row('2026-08-02', -200_000, 'rent')] }).leftOverCents).toBe(-70_000)
  })

  it('ranks the Year Actuals, shares them of all spent, and leaves out refunds and gated plans', () => {
    const s = year({
      categories: CATS,
      asOf: isoDate('2025-12-31'),
      planHistory: [plan('rent', '2026-01-01', 80_000)],
      entries: [row('2026-02-01', -1_000, 'music'), row('2026-03-01', -20_000, 'loan'), row('2026-09-01', -30_000, 'loan'), row('2026-04-01', -30_000, 'eat'), row('2026-04-02', 2_000, 'back')],
    })
    // Of 81,000 spent: 50,000 is 6,172.8 bp, 30,000 is 3,703.7, 1,000 is 123.5 (half-up).
    expect(top(s)).toEqual([
      ['loan', 50_000, 6_173],
      ['eat', 30_000, 3_704],
      ['music', 1_000, 123],
    ])
    expect(s.atAGlance.biggest).toEqual({ categoryId: 'loan', name: 'loan', kind: 'debt', amountCents: 50_000, shareBp: 6_173 })
  })

  it("breaks a tie by the workbook's list order, then Setup's row order (Hidden!B3:B95)", () => {
    const s = year({
      categories: CATS,
      asOf: isoDate('2026-01-31'),
      planHistory: [plan('rent', '2026-01-01', 30_000)],
      entries: [row('2026-02-01', -30_000, 'loan'), row('2026-03-01', -30_000, 'gas'), row('2026-04-01', -30_000, 'eat')],
    })
    expect(top(s)).toEqual([
      ['eat', 30_000, 2_500],
      ['gas', 30_000, 2_500],
      ['rent', 30_000, 2_500],
    ])
  })

  it('has no biggest expense when nothing was spent, only refunded', () => {
    const s = year({ categories: CATS, entries: [row('2026-04-02', 2_000, 'back')] })
    expect(s.atAGlance.top3).toEqual([])
    expect(s.atAGlance.biggest).toBeNull()
  })

  it('picks the month that saved most, the earliest of equals, with its goal (Hidden!I60)', () => {
    const s = year({
      budgetHistory: [budget('fund', '2026-03-01', 4_000)],
      entries: [row('2026-03-09', -5_000, 'fund'), row('2026-07-09', -5_000, 'fund'), row('2026-05-09', -3_000, 'fund')],
    })
    expect(s.atAGlance.bestSavingsMonth).toEqual({ month: '2026-03-01', savedCents: 5_000, goalCents: 4_000 })
    // Nothing saved, and money taken out in January: the first month at $0.
    const none = year({ entries: [row('2026-01-09', 1_000, 'fund')] })
    expect(none.atAGlance.bestSavingsMonth).toEqual({ month: '2026-02-01', savedCents: 0, goalCents: 0 })
  })
})
