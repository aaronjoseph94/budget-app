/**
 * The rows the database gave, in the shape packages/core reads them.
 *
 * Renaming only: snake_case columns to core's names, and dates checked into
 * IsoDate. Nothing is added up or chosen here; which budget or monthly
 * amount is in effect, and what counts where, is core's to say. The Month
 * and the Year read the same rows, so they read them through one place.
 */
import { isoDate, type BudgetHistoryRow, type PeriodCategory, type PeriodEntry, type PlanHistoryRow, type ShopEntry, type WeekCategory } from '@budget/core'
import { normalizeMerchant } from '@budget/statement-parsers'
import type { BudgetRow, Category, LedgerRow, PlanRow } from './ledger.js'

export function categoriesForCore(categories: readonly Category[]): PeriodCategory[] {
  return categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, sortOrder: c.sort_order }))
}

/** As categoriesForCore, with the weekly budget the Week reads as each one's Budgeted or Goal. */
export function weekCategoriesForCore(categories: readonly Category[]): WeekCategory[] {
  return categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, sortOrder: c.sort_order, weeklyBudgetCents: c.weekly_budget_cents }))
}

/** Every budget and goal as typed; core picks the one in effect (D12). */
export function budgetsForCore(budgets: readonly BudgetRow[]): BudgetHistoryRow[] {
  return budgets.map((b) => ({
    categoryId: b.category_id,
    month: isoDate(b.month),
    applies: b.applies,
    budgetCents: b.budget_cents,
  }))
}

/**
 * Every monthly amount as typed; core picks the one in effect (D13), and
 * counts it where no real charge replaces it (D5).
 */
export function plansForCore(plans: readonly PlanRow[]): PlanHistoryRow[] {
  return plans.map((p) => ({
    categoryId: p.category_id,
    effectiveMonth: isoDate(p.effective_month),
    plannedCents: p.planned_cents,
    dueDay: p.due_day,
  }))
}

export function entriesForCore(rows: readonly LedgerRow[]): PeriodEntry[] {
  return rows.map((r) => ({ postedOn: isoDate(r.posted_on), amountCents: r.amount_cents, categoryId: r.category_id }))
}

/** Rows typed in Add or read from a receipt photo, as against a card statement's (F38). */
const BY_HAND: ReadonlySet<string> = new Set(['typed', 'receipt_photo'])

/**
 * As entriesForCore, with each row's shop: the descriptor as
 * statement-parsers normalises it, the key a learned rule matches, so
 * core groups by shop without importing a parser (plan §7, A17).
 */
export function shopEntriesForCore(rows: readonly LedgerRow[]): ShopEntry[] {
  return rows.map((r) => ({
    id: r.id,
    postedOn: isoDate(r.posted_on),
    amountCents: r.amount_cents,
    categoryId: r.category_id,
    shop: normalizeMerchant(r.merchant_raw),
    by: BY_HAND.has(r.source) ? 'hand' : 'statement',
  }))
}
