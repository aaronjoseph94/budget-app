/**
 * The database's rows, renamed for the engine exactly as the app renames
 * them (PLAN §2.4, "the same figure as the screen"): the casts of
 * `apps/web/src/ledger.ts`, tested against it in
 * `apps/web/test/ai-apps-parity.test.ts`. Rows are cast, not parsed:
 * database rows are not one of CLAUDE.md's four zod boundaries. A part
 * that is not a list is unreadable.
 */
import {
  historyStart,
  isoDate,
  monthBounds,
  shiftMonth,
  type BudgetHistoryRow,
  type DebtPlanInput,
  type IncomeSchedule,
  type MonthSheetInput,
  type PaycheckSheetInput,
  type PaySchedule,
  type PeriodCategory,
  type PeriodEntry,
  type PlanHistoryRow,
  type ShopEntry,
  type SpendingBase,
  type WeekCategory,
  type WeekSheetInput,
  type YearSheetInput,
} from '@budget/core'
import type { IsoDate } from '@budget/money-primitives'
import type { CategoryKind } from '@budget/schema'
import { normalizeMerchant } from '@budget/statement-parsers'

/** A category as `listCategories` gives it to the app's screens. */
export interface CategoryRow {
  readonly id: string
  readonly name: string
  readonly kind: CategoryKind
  readonly sort_order: number
  readonly weekly_budget_cents: number | null
}

export class UnreadableRows extends RangeError {}

function listOf(part: unknown): readonly unknown[] {
  if (!Array.isArray(part)) throw new UnreadableRows('a part of the read was not a list')
  return part
}

export function categoriesFrom(part: unknown): CategoryRow[] {
  return (listOf(part) as readonly CategoryRow[]).map((c) => ({
    ...c,
    sort_order: Number(c.sort_order),
    weekly_budget_cents: c.weekly_budget_cents === null ? null : Number(c.weekly_budget_cents),
  }))
}

/** A ledger row as `listTransactions` gives it to the app's screens. */
export interface LedgerRow {
  readonly id: string
  readonly posted_on: string
  readonly amount_cents: number
  readonly merchant_raw: string
  readonly category_id: string
  readonly source: string
}

export function txnsFrom(part: unknown): LedgerRow[] {
  return (listOf(part) as readonly LedgerRow[]).map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }))
}

/** Categories as the Month, the Year and every comparison give them to core. */
export function periodCategories(rows: readonly CategoryRow[]): PeriodCategory[] {
  return rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind, sortOrder: c.sort_order }))
}

/** As periodCategories, with the weekly budget the Week reads as each one's Budgeted or Goal. */
export function weekCategories(rows: readonly CategoryRow[]): WeekCategory[] {
  return rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind, sortOrder: c.sort_order, weeklyBudgetCents: c.weekly_budget_cents }))
}

/** Every budget and goal as typed; core picks the one in effect (D12). */
export function budgetsFrom(part: unknown): BudgetHistoryRow[] {
  type Row = { category_id: string; month: string; applies: 'onward' | 'only'; budget_cents: number | null }
  return (listOf(part) as readonly Row[]).map((b) => ({
    categoryId: b.category_id,
    month: isoDate(b.month),
    applies: b.applies,
    budgetCents: b.budget_cents === null ? null : Number(b.budget_cents),
  }))
}

/** Every monthly amount as typed; core picks the one in effect (D13). */
export function plansFrom(part: unknown): PlanHistoryRow[] {
  type Row = { category_id: string; effective_month: string; planned_cents: number | null; due_day: number | null }
  return (listOf(part) as readonly Row[]).map((p) => ({
    categoryId: p.category_id,
    effectiveMonth: isoDate(p.effective_month),
    plannedCents: p.planned_cents === null ? null : Number(p.planned_cents),
    dueDay: p.due_day === null ? null : Number(p.due_day),
  }))
}

export function entriesFrom(rows: readonly LedgerRow[]): PeriodEntry[] {
  return rows.map((r) => ({ postedOn: isoDate(r.posted_on), amountCents: r.amount_cents, categoryId: r.category_id }))
}

/** Rows typed in Add, read from a receipt photo or added by an AI app, as against a card statement's (F38). */
const BY_HAND: ReadonlySet<string> = new Set(['typed', 'receipt_photo', 'ai_app'])

/** As entriesFrom, with each row's shop as statement-parsers normalises it, as the app's shopEntriesForCore gives it. */
export function shopEntriesFrom(rows: readonly LedgerRow[]): ShopEntry[] {
  return rows.map((r) => ({
    id: r.id,
    postedOn: isoDate(r.posted_on),
    amountCents: r.amount_cents,
    categoryId: r.category_id,
    shop: normalizeMerchant(r.merchant_raw),
    by: BY_HAND.has(r.source) ? 'hand' : 'statement',
  }))
}

/** The shops marked "Not a subscription": 0017 keeps each as a dismissal's key, as the app's notSubscriptionsOf reads it (F38). */
export function notSubscriptionsFrom(part: unknown): string[] {
  const NOT_SUBSCRIPTION = 'not_subscription:'
  return (listOf(part) as readonly string[]).filter((k) => k.startsWith(NOT_SUBSCRIPTION)).map((k) => k.slice(NOT_SUBSCRIPTION.length))
}

/** When each income source is paid, as the forecast reads it (F29). */
export function schedulesFrom(part: unknown): IncomeSchedule[] {
  type Row = { category_id: string; first_pay_date: string; frequency: IncomeSchedule['frequency'] }
  return (listOf(part) as readonly Row[]).map((s) => ({ categoryId: s.category_id, firstPayDate: isoDate(s.first_pay_date), frequency: s.frequency }))
}

/** The starting balance typed for the month beginning `month`, or null: never another month's (D17). */
export function balanceFor(part: unknown, month: string): number | null {
  const row = (listOf(part) as readonly { month: string; starting_balance_cents: number }[]).find((m) => m.month === month)
  return row === undefined ? null : Number(row.starting_balance_cents)
}

/** What the records say: where they start (F24), and the latest statement's end. */
export function recordsFrom(part: unknown): { readonly historyStart: IsoDate | null; readonly statementEnds: IsoDate[] } {
  if (typeof part !== 'object' || part === null) throw new UnreadableRows('the records were not an object')
  const r = part as { statement_start: string | null; statement_end: string | null; first_entry: string | null }
  const dates = (d: string | null) => (d === null ? [] : [isoDate(d)])
  return {
    historyStart: historyStart({ statementPeriodStarts: dates(r.statement_start), entryDates: dates(r.first_entry) }).start,
    statementEnds: dates(r.statement_end),
  }
}

/** The waiting rows dated inside [from, to]: a count of rows, never of money. */
export function pendingIn(part: unknown, from: string, to: string): number {
  return (listOf(part) as readonly string[]).filter((d) => d >= from && d <= to).length
}

/** An `ai_app_read` answer: each part as the database gave it. */
export type Read = Readonly<Record<string, unknown>>

/** The Month's input for the month beginning `start`, as MonthScreen builds it. */
export function monthSheetInput(read: Read, start: IsoDate): MonthSheetInput {
  return {
    asOf: start,
    categories: periodCategories(categoriesFrom(read['categories'])),
    budgetHistory: budgetsFrom(read['budgets']),
    planHistory: plansFrom(read['plans']),
    entries: entriesFrom(txnsFrom(read['txns'])),
    statementPeriodEnds: recordsFrom(read['records']).statementEnds,
    startingBalanceCents: balanceFor(read['balances'], start),
  }
}

/** The Week's input for the week holding `asOf`, as WeekScreen builds it: no start is typed for a week (D17). */
export function weekSheetInput(read: Read, asOf: IsoDate): WeekSheetInput {
  return {
    asOf,
    categories: weekCategories(categoriesFrom(read['categories'])),
    planHistory: plansFrom(read['plans']),
    entries: entriesFrom(txnsFrom(read['txns'])),
    statementPeriodEnds: recordsFrom(read['records']).statementEnds,
    startingBalanceCents: null,
  }
}

/**
 * Each income source paid on a schedule, in Setup's order, as the Paycheck
 * offers them: a schedule left on another list pays nobody (N27).
 */
export function paySources(read: Read): { readonly name: string; readonly schedule: PaySchedule }[] {
  const schedules = schedulesFrom(read['schedules'])
  return categoriesFrom(read['categories'])
    .filter((c) => c.kind === 'income')
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .flatMap((c) => {
      const s = schedules.find((row) => row.categoryId === c.id)
      return s === undefined ? [] : [{ name: c.name, schedule: { firstPayDate: s.firstPayDate, frequency: s.frequency } }]
    })
}

/** The Paycheck's input for the pay period beginning `start`, as PaycheckPeriod builds it: no start is typed (D17). */
export function paycheckSheetInput(read: Read, start: IsoDate, schedule: PaySchedule): PaycheckSheetInput {
  return {
    asOf: start,
    schedule,
    categories: periodCategories(categoriesFrom(read['categories'])),
    budgetHistory: budgetsFrom(read['budgets']),
    planHistory: plansFrom(read['plans']),
    entries: entriesFrom(txnsFrom(read['txns'])),
    statementPeriodEnds: recordsFrom(read['records']).statementEnds,
    startingBalanceCents: null,
  }
}

/** The Year's input for the twelve months from `start`, as YearScreen builds it: the start month's balance alone. */
export function yearSheetInput(read: Read, start: IsoDate, asOf: IsoDate): YearSheetInput {
  const balance = balanceFor(read['balances'], start)
  return {
    startMonth: start,
    asOf,
    categories: periodCategories(categoriesFrom(read['categories'])),
    budgetHistory: budgetsFrom(read['budgets']),
    planHistory: plansFrom(read['plans']),
    entries: entriesFrom(txnsFrom(read['txns'])),
    startingBalances: balance === null ? [] : [{ month: start, cents: balance }],
  }
}

/** What Ask gives answerQuery about spending, as its answerOf builds it from the Coach's year: twelve months back from this month's first day. */
export function askInput(read: Read, today: IsoDate): SpendingBase & { readonly notSubscriptions: readonly string[] } {
  return {
    asOf: today,
    historyStart: recordsFrom(read['records']).historyStart,
    readFrom: shiftMonth(monthBounds(today).start, -12),
    categories: weekCategories(categoriesFrom(read['categories'])),
    budgetHistory: budgetsFrom(read['budgets']),
    planHistory: plansFrom(read['plans']),
    entries: shopEntriesFrom(txnsFrom(read['txns'])),
    notSubscriptions: notSubscriptionsFrom(read['not_subscriptions']),
  }
}

/** The debts and their extra payments as the app's debtsForCore gives them: a debt by its name, an extra by its debt's. */
export function debtsFrom(read: Read): DebtPlanInput {
  type Debt = { id: string; name: string; starting_balance_cents: number; minimum_payment_cents: number; apr_basis_points: number; start_date: string }
  type Extra = { debt_id: string; month: string; amount_cents: number }
  const rows = listOf(read['debts']) as readonly Debt[]
  return {
    debts: rows.map((d) => ({
      name: d.name,
      startMonth: isoDate(d.start_date),
      startingBalanceCents: Number(d.starting_balance_cents),
      minimumPaymentCents: Number(d.minimum_payment_cents),
      aprBasisPoints: d.apr_basis_points,
    })),
    extraPayments: (listOf(read['debt_extras']) as readonly Extra[]).flatMap((e) => {
      const debt = rows.find((d) => d.id === e.debt_id)
      return debt === undefined ? [] : [{ debtName: debt.name, month: isoDate(e.month), amountCents: Number(e.amount_cents) }]
    }),
  }
}
