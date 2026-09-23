import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import type { BudgetHistoryRow } from '../src/budgets.js'
import type { PayFrequency } from '../src/pay-period.js'
import { paycheckSheet, type PeriodCategory, type PeriodEntry } from '../src/period-sheet.js'
import type { PlanHistoryRow } from '../src/plans.js'

/**
 * Suite, not External: worked by hand from invented rows under F15 B. The
 * cached Paycheck cells that still hold are replayed by workbook-paycheck;
 * none of them shows a share, which is what these check.
 */

const CATEGORIES: PeriodCategory[] = [
  { id: 'pay', name: 'Pay', kind: 'income', sortOrder: 0 },
  { id: 'flight', name: 'Flight fund', kind: 'savings', sortOrder: 0 },
  { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 0 },
  { id: 'loan', name: 'Loan', kind: 'debt', sortOrder: 0 },
  { id: 'stream', name: 'Streaming', kind: 'subscription', sortOrder: 0 },
  { id: 'food', name: 'Groceries', kind: 'variable', sortOrder: 0 },
]

const plan = (categoryId: string, month: string, plannedCents: number | null, dueDay: number | null): PlanHistoryRow =>
  ({ categoryId, effectiveMonth: isoDate(month), plannedCents, dueDay })
const budget = (categoryId: string, month: string, budgetCents: number | null, applies: 'onward' | 'only' = 'onward'): BudgetHistoryRow =>
  ({ categoryId, month: isoDate(month), applies, budgetCents })
const entry = (postedOn: string, amountCents: number, categoryId: string): PeriodEntry =>
  ({ postedOn: isoDate(postedOn), amountCents, categoryId })

function sheetFor(
  frequency: PayFrequency,
  firstPayDate: string,
  asOf: string,
  extra: { plans?: PlanHistoryRow[]; budgets?: BudgetHistoryRow[]; entries?: PeriodEntry[] } = {},
) {
  return paycheckSheet({
    asOf: isoDate(asOf),
    schedule: { firstPayDate: isoDate(firstPayDate), frequency },
    categories: CATEGORIES,
    budgetHistory: extra.budgets ?? [],
    planHistory: extra.plans ?? [],
    entries: extra.entries ?? [],
    statementPeriodEnds: [],
    startingBalanceCents: null,
  })
}
const row = (sheet: ReturnType<typeof sheetFor>, block: keyof ReturnType<typeof sheetFor>['blocks'], id: string) =>
  sheet.blocks[block].rows.find((r) => r.categoryId === id)

describe('paycheckSheet (suite)', () => {
  // Bi-weekly from Friday 11 September 2026: the period is 11–24 September.
  const RENT = plan('rent', '2026-09-01', 160_000, 1)

  it("shows a bill's share whatever its day paid: $1,600 rent is $738.46 a bi-weekly period", () => {
    const sheet = sheetFor('biweekly', '2026-09-11', '2026-09-23', { plans: [RENT] })
    expect([sheet.from, sheet.to]).toEqual(['2026-09-11', '2026-09-24'])
    // Due on the 1st, outside the period; F15 counts the share in every period.
    expect(row(sheet, 'bill', 'rent')).toMatchObject({ actualCents: 73_846, basis: 'planned' })
    expect(sheet.paydaysAYear).toBe(26)
    expect(sheet.month).toBe('2026-09-01')
  })

  it('shares by 52 for weekly pay, and not at all for monthly', () => {
    expect(row(sheetFor('weekly', '2026-09-18', '2026-09-23', { plans: [RENT] }), 'bill', 'rent')?.actualCents).toBe(36_923)
    const monthly = sheetFor('monthly', '2026-01-15', '2026-09-23', { plans: [RENT] })
    expect([monthly.from, monthly.to]).toEqual(['2026-09-15', '2026-10-14'])
    expect(row(monthly, 'bill', 'rent')?.actualCents).toBe(160_000)
  })

  it('counts a real charge as it is, in place of the share (D5)', () => {
    const sheet = sheetFor('biweekly', '2026-09-11', '2026-09-23', {
      plans: [plan('stream', '2026-09-01', 1_799, 20), plan('loan', '2026-09-01', 30_000, 12)],
      entries: [entry('2026-09-20', -1_799, 'stream'), entry('2026-09-10', -30_000, 'loan')],
    })
    expect(row(sheet, 'subscription', 'stream')).toMatchObject({ actualCents: 1_799, basis: 'real' })
    // Paid the day before the period, so its share stands: 30000 × 12 ÷ 26 = 13846.15…
    expect(row(sheet, 'debt', 'loan')).toMatchObject({ actualCents: 13_846, basis: 'planned' })
  })

  it("splits the month's budgets and goals the same way, and subtracts real rows from them", () => {
    const sheet = sheetFor('biweekly', '2026-09-11', '2026-09-23', {
      budgets: [budget('food', '2026-08-01', 60_000), budget('pay', '2026-09-01', 500_000), budget('flight', '2026-09-01', 40_000)],
      entries: [entry('2026-09-12', -10_000, 'food'), entry('2026-09-11', 250_000, 'pay'), entry('2026-09-11', -20_000, 'flight')],
    })
    // 60000 × 12 ÷ 26 = 27692.31… → 27692; 27692 − 10000 left.
    expect(row(sheet, 'variable', 'food')).toMatchObject({ budgetCents: 27_692, actualCents: 10_000, remainingCents: 17_692 })
    expect(sheet.summary.leftToSpendCents).toBe(17_692)
    // 500000 × 12 ÷ 26 = 230769.23… → 230769.
    expect(row(sheet, 'income', 'pay')).toMatchObject({ budgetCents: 230_769, actualCents: 250_000 })
    // 40000 × 12 ÷ 26 = 18461.54… → 18462; saved 20000, 1538 over.
    expect(row(sheet, 'savings', 'flight')).toMatchObject({ budgetCents: 18_462, differenceCents: 1_538 })
  })

  it("takes the amounts and budgets of the payday's month across a month end", () => {
    // The period of 25 September runs to 8 October; October's raise and its
    // "just this month" budget wait for a period that starts in October.
    const sheet = sheetFor('biweekly', '2026-09-11', '2026-10-02', {
      plans: [RENT, plan('rent', '2026-10-01', 170_000, 1)],
      budgets: [budget('food', '2026-09-01', 26_000), budget('food', '2026-10-01', 0, 'only')],
    })
    expect([sheet.from, sheet.to, sheet.month]).toEqual(['2026-09-25', '2026-10-08', '2026-09-01'])
    expect(row(sheet, 'bill', 'rent')?.actualCents).toBe(73_846)
    // 26000 × 12 ÷ 26 = 12000 exactly.
    expect(row(sheet, 'variable', 'food')?.budgetCents).toBe(12_000)
  })

  it('leaves out rows either side of the period, and adds the rounded shares into Spent', () => {
    const sheet = sheetFor('biweekly', '2026-09-11', '2026-09-23', {
      plans: [RENT, plan('stream', '2026-09-01', 1_799, 23)],
      entries: [entry('2026-09-10', -5_000, 'food'), entry('2026-09-25', -7_000, 'food'), entry('2026-09-24', -1_500, 'food')],
    })
    expect(row(sheet, 'variable', 'food')?.actualCents).toBe(1_500)
    // 73846 + 830 + 1500: each share rounds on its own (F15).
    expect(sheet.summary.spentCents).toBe(76_176)
  })

  it('keeps a stopped amount and a missing budget as nothing, never $0 shared', () => {
    const sheet = sheetFor('weekly', '2026-09-18', '2026-09-23', {
      plans: [plan('rent', '2026-08-01', 160_000, 1), plan('rent', '2026-09-01', null, 1)],
      budgets: [budget('food', '2026-09-01', null)],
    })
    expect(row(sheet, 'bill', 'rent')).toMatchObject({ actualCents: 0, basis: 'none' })
    expect(row(sheet, 'variable', 'food')?.budgetCents).toBeNull()
  })
})
