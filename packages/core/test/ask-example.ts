import { isoDate } from '@budget/money-primitives'
import type { BudgetHistoryRow, PlanHistoryRow, ShopEntry, SpendingBase, WeekCategory } from '../src/index.js'

/**
 * F48's worked example, which Ask's tests share: Thursday 24 September
 * 2026, records from 1 June, twelve months read. Shop names are invented.
 */
export const CATEGORIES: readonly WeekCategory[] = [
  { id: 'pay', name: 'Paycheck', kind: 'income', sortOrder: 1, weeklyBudgetCents: null },
  { id: 'fund', name: 'Flight fund', kind: 'savings', sortOrder: 2, weeklyBudgetCents: null },
  { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 3, weeklyBudgetCents: null },
  { id: 'coffee', name: 'Coffee', kind: 'variable', sortOrder: 4, weeklyBudgetCents: 1_000 },
  { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 5, weeklyBudgetCents: null },
  { id: 'music', name: 'Music', kind: 'subscription', sortOrder: 6, weeklyBudgetCents: null },
  { id: 'card', name: 'Card payment', kind: 'transfer', sortOrder: 7, weeklyBudgetCents: null },
]

let next = 0

/** One row: below 0 is money out. Ids count up, so a later row sorts later on its day. */
export function row(date: string, dollars: number, categoryId: string, shop = ''): ShopEntry {
  next += 1
  return { id: `a${String(next).padStart(4, '0')}`, postedOn: isoDate(date), amountCents: Math.round(dollars * 100), categoryId, shop, by: 'statement' }
}

export const ENTRIES: readonly ShopEntry[] = [
  row('2026-08-05', -4.5, 'coffee', 'BEAN CART'),
  row('2026-08-20', -5.5, 'coffee', 'BEAN CART'),
  row('2026-08-28', -7, 'coffee', 'KIOSK'),
  row('2026-09-03', -5, 'coffee', 'BEAN CART'),
  row('2026-09-10', -6, 'coffee', 'KIOSK'),
  row('2026-08-12', -80, 'groceries', 'GROCER'),
  row('2026-09-14', -90, 'groceries', 'GROCER'),
  row('2026-09-15', 10, 'groceries', 'GROCER'),
  row('2026-08-01', -1500, 'rent', 'LANDLORD'),
  row('2026-09-01', -1500, 'rent', 'LANDLORD'),
  row('2026-08-15', 3000, 'pay', 'PAYROLL'),
  row('2026-09-15', 3000, 'pay', 'PAYROLL'),
  row('2026-08-16', -500, 'fund'),
  row('2026-09-02', -900, 'card'),
]

/** Rent planned at $1,500.00 on the 1st from June; Coffee budgeted $40.00 a month, Groceries $100.00. */
export const PLANS: readonly PlanHistoryRow[] = [{ categoryId: 'rent', effectiveMonth: isoDate('2026-06-01'), plannedCents: 150_000, dueDay: 1 }]
export const BUDGETS: readonly BudgetHistoryRow[] = [
  { categoryId: 'coffee', month: isoDate('2026-06-01'), applies: 'onward', budgetCents: 4_000 },
  { categoryId: 'groceries', month: isoDate('2026-06-01'), applies: 'onward', budgetCents: 10_000 },
]

export const BASE: SpendingBase = {
  asOf: isoDate('2026-09-24'),
  historyStart: isoDate('2026-06-01'),
  readFrom: isoDate('2025-09-01'),
  categories: CATEGORIES,
  budgetHistory: BUDGETS,
  planHistory: PLANS,
  entries: ENTRIES,
}
