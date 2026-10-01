import { describe, expect, it } from 'vitest'
import { answerQuery, debtPlan, isoDate, monthSheet, payoffStrategies, paycheckSheet, weekSheet, yearSheet, type AskIntent, type PaySchedule } from '@budget/core'
import { askInput, categoriesFrom, debtsFrom, monthSheetInput, paySources, paycheckSheetInput, weekSheetInput, yearSheetInput } from '@budget/ai-apps/rows'
import {
  getMonthBalance,
  latestStatementEnd,
  listDebtExtras,
  listDebts,
  readRecordsStart,
  listBudgetHistory,
  listCategories,
  listPaySchedules,
  listPlanHistory,
  listTransactions,
  type Category,
} from '../src/ledger.js'
import { budgetsForCore, categoriesForCore, entriesForCore, plansForCore, shopEntriesForCore, weekCategoriesForCore } from '../src/sheet-input.js'
import { answerOf } from '../src/ask/answer.js'
import { debtsForCore } from '../src/debts.js'
import { historyOf, type DigestRows } from '../src/coach/facts.js'
import { createFakeSupabase, type FakeTables } from './fake-supabase.js'

/**
 * The AI apps server renames the database's rows for the engine exactly as
 * the app does (MCP PLAN §2.4), so a chat cannot quote a figure the screen
 * does not show. Each case gives both the same rows, in the order the
 * database returns them, and requires the same engine input and output.
 */
describe('the AI apps server reads rows as the app does', () => {
  it('categories', async () => {
    // By sort order, then name, as ai_app_read and the app's read both order them.
    const rows: Category[] = [
      { id: 'c2', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 15000 },
      { id: 'c1', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null },
      { id: 'c3', name: 'Snacks', kind: 'variable', sort_order: 0, weekly_budget_cents: 0 },
      { id: 'c4', name: 'Rent', kind: 'bill', sort_order: 2, weekly_budget_cents: null },
    ]
    const app = await listCategories(createFakeSupabase({ categories: rows }).client)
    expect(categoriesFrom(JSON.parse(JSON.stringify(rows)))).toEqual(app)
    expect(app).toHaveLength(4)
  })

  // One owner's September 2026, and a week across its end.
  const tables: Partial<FakeTables> = {
    categories: [
      { id: 'pay', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: 60000 },
      { id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 15000 },
      { id: 'rent', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null },
      { id: 'fund', name: 'Trip fund', kind: 'savings', sort_order: 0, weekly_budget_cents: 5000 },
      { id: 'card', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
    ],
    category_budgets: [
      { id: 'b1', category_id: 'food', month: '2026-08-01', applies: 'onward', budget_cents: 60000 },
      { id: 'b2', category_id: 'food', month: '2026-09-01', applies: 'only', budget_cents: 55000 },
      { id: 'b3', category_id: 'pay', month: '2026-01-01', applies: 'onward', budget_cents: 250000 },
    ],
    category_plans: [
      { id: 'p1', category_id: 'rent', effective_month: '2026-01-01', planned_cents: 120000, due_day: 1 },
      { id: 'p2', category_id: 'rent', effective_month: '2026-10-01', planned_cents: 125000, due_day: 1 },
    ],
    month_balances: [
      { id: 'm1', month: '2026-08-01', starting_balance_cents: 90000 },
      { id: 'm2', month: '2026-09-01', starting_balance_cents: 100000 },
    ],
    transactions: [
      { id: 't1', posted_on: '2026-09-02', amount_cents: -4520, merchant_raw: 'FRESHCO 1234', category_id: 'food', source: 'card_csv' },
      { id: 't2', posted_on: '2026-09-15', amount_cents: 250000, merchant_raw: 'PAYROLL', category_id: 'pay', source: 'typed' },
      { id: 't3', posted_on: '2026-09-29', amount_cents: -1275, merchant_raw: 'FRESHCO 1234', category_id: 'food', source: 'ai_app' },
      { id: 't4', posted_on: '2026-09-30', amount_cents: 50000, merchant_raw: 'PAYMENT THANK YOU', category_id: 'card', source: 'card_csv' },
      { id: 't5', posted_on: '2026-10-02', amount_cents: -2000, merchant_raw: 'FRESHCO 1234', category_id: 'food', source: 'card_csv' },
    ],
    pay_schedules: [{ id: 's1', category_id: 'pay', first_pay_date: '2026-09-15', frequency: 'monthly' }],
    ingest_batches: [
      { id: 'i1', source: 'card_csv', created_at: '2026-09-20T12:00:00Z', period_start: '2026-08-08', period_end: '2026-09-07' },
      { id: 'i2', source: 'card_csv', created_at: '2026-10-05T12:00:00Z', period_start: '2026-09-08', period_end: '2026-10-07' },
    ],
  }

  /** What ai_app_read answers for the same rows, in its order, through JSON as PostgREST sends it. */
  const read = JSON.parse(
    JSON.stringify({
      today: '2026-09-30',
      categories: [...(tables.categories ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
      budgets: [...(tables.category_budgets ?? [])].sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id)),
      plans: [...(tables.category_plans ?? [])].sort((a, b) => a.effective_month.localeCompare(b.effective_month) || a.id.localeCompare(b.id)),
      txns: [...(tables.transactions ?? [])].sort((a, b) => b.posted_on.localeCompare(a.posted_on) || a.id.localeCompare(b.id)),
      balances: tables.month_balances,
      schedules: tables.pay_schedules,
      records: { statement_start: '2026-08-08', statement_end: '2026-10-07', first_entry: '2026-09-02' },
    }),
  ) as Record<string, unknown>

  // The server reads the months either side (its window); the screens read
  // their own period, and what was typed up to it. So each case checks the
  // renaming on the same rows, and the figures against the screen's own read.
  const WINDOW = { from: '2026-08-01', to: '2026-10-31' }

  async function monthAsTheApp(through: string, range: { from: string; to: string }) {
    const supabase = createFakeSupabase(tables).client
    const start = isoDate('2026-09-01')
    return {
      asOf: start,
      categories: categoriesForCore(await listCategories(supabase)),
      budgetHistory: budgetsForCore(await listBudgetHistory(supabase, through)),
      planHistory: plansForCore(await listPlanHistory(supabase, through, 'month')),
      entries: entriesForCore(await listTransactions(supabase, range)),
      statementPeriodEnds: (await latestStatementEnd(supabase)).map((e) => isoDate(e)),
      startingBalanceCents: await getMonthBalance(supabase, start),
    }
  }

  it('the Month', async () => {
    const server = monthSheetInput(read, isoDate('2026-09-01'))
    expect(server).toEqual(await monthAsTheApp(WINDOW.to, WINDOW))
    expect(server.budgetHistory).toHaveLength(3)
    expect(server.startingBalanceCents).toBe(100000)
    const screen = await monthAsTheApp('2026-09-01', { from: '2026-09-01', to: '2026-09-30' })
    expect(monthSheet(server)).toEqual(monthSheet(screen))
  })

  async function weekAsTheApp(through: string, range: { from: string; to: string }) {
    const supabase = createFakeSupabase(tables).client
    return {
      asOf: isoDate('2026-09-30'),
      categories: weekCategoriesForCore(await listCategories(supabase)),
      planHistory: plansForCore(await listPlanHistory(supabase, through, 'week')),
      entries: entriesForCore(await listTransactions(supabase, range)),
      statementPeriodEnds: (await latestStatementEnd(supabase)).map((e) => isoDate(e)),
      startingBalanceCents: null,
    }
  }

  it('the Week', async () => {
    const server = weekSheetInput(read, isoDate('2026-09-30'))
    expect(server).toEqual(await weekAsTheApp(WINDOW.to, WINDOW))
    // Monday 28 September to Sunday 4 October: October's rent counts on the 1st.
    const screen = await weekAsTheApp('2026-10-01', { from: '2026-09-28', to: '2026-10-04' })
    expect(weekSheet(server)).toEqual(weekSheet(screen))
    expect(weekSheet(server).blocks.bill.actualTotalCents).toBe(125000)
  })

  async function paycheckAsTheApp(schedule: PaySchedule, through: string, range: { from: string; to: string }) {
    const supabase = createFakeSupabase(tables).client
    return {
      asOf: isoDate('2026-09-15'),
      schedule,
      categories: categoriesForCore(await listCategories(supabase)),
      budgetHistory: budgetsForCore(await listBudgetHistory(supabase, through, 'paycheck')),
      planHistory: plansForCore(await listPlanHistory(supabase, through, 'paycheck')),
      entries: entriesForCore(await listTransactions(supabase, range)),
      statementPeriodEnds: (await latestStatementEnd(supabase)).map((e) => isoDate(e)),
      startingBalanceCents: null,
    }
  }

  it('the Paycheck', async () => {
    const rows = await listPaySchedules(createFakeSupabase(tables).client, 'paycheck')
    const schedule: PaySchedule = { firstPayDate: isoDate(rows[0]?.first_pay_date ?? ''), frequency: 'monthly' }
    expect(paySources(read)).toEqual([{ name: 'Pay', schedule }])
    const server = paycheckSheetInput(read, isoDate('2026-09-15'), schedule)
    expect(server).toEqual(await paycheckAsTheApp(schedule, WINDOW.to, WINDOW))
    // 15 September to 14 October, with September's amounts, as the screen reads them.
    const screen = await paycheckAsTheApp(schedule, '2026-09-01', { from: '2026-09-15', to: '2026-10-14' })
    expect(paycheckSheet(server)).toEqual(paycheckSheet(screen))
    expect(paycheckSheet(server).blocks.variable.effectiveBudgetTotalCents).toBe(55000)
  })

  async function yearAsTheApp(own: Partial<FakeTables>, through: string, range: { from: string; to: string }) {
    const supabase = createFakeSupabase(own).client
    const start = isoDate('2026-01-01')
    const balance = await getMonthBalance(supabase, start)
    return {
      startMonth: start,
      asOf: isoDate('2026-09-30'),
      categories: categoriesForCore(await listCategories(supabase)),
      budgetHistory: budgetsForCore(await listBudgetHistory(supabase, through, 'year')),
      planHistory: plansForCore(await listPlanHistory(supabase, through, 'year')),
      entries: entriesForCore(await listTransactions(supabase, range)),
      startingBalances: balance === null ? [] : [{ month: start, cents: balance }],
    }
  }

  it('the Year', async () => {
    const whole = { from: '2026-01-01', to: '2026-12-31' }
    // With January's start typed, so the balances are renamed too.
    const withStart = { ...read, balances: [{ month: '2026-01-01', starting_balance_cents: 80000 }, ...(read.balances as unknown[])] }
    const own = { ...tables, month_balances: [{ id: 'm0', month: '2026-01-01', starting_balance_cents: 80000 }, ...(tables.month_balances ?? [])] }
    const server = yearSheetInput(withStart, isoDate('2026-01-01'), isoDate('2026-09-30'))
    expect(server).toEqual(await yearAsTheApp(own, whole.to, whole))
    const screen = await yearAsTheApp(own, '2026-12-01', whole)
    expect(yearSheet(server)).toEqual(yearSheet(screen))
    expect(yearSheet(server).startingBalanceCents).toBe(80000)
  })

  it('Ask', async () => {
    const supabase = createFakeSupabase(tables).client
    // The Coach's year, as useCoachRead reads it on 30 September: from September 2025, budgets and plans three months ahead.
    const coach: DigestRows = {
      asOf: '2026-09-30',
      readFrom: '2025-09-01',
      rows: await listTransactions(supabase, { from: '2025-09-01', to: '2026-09-30' }),
      budgets: await listBudgetHistory(supabase, '2026-12-01'),
      plans: await listPlanHistory(supabase, '2026-12-01', 'month'),
      statementEnds: await latestStatementEnd(supabase),
      records: await readRecordsStart(supabase),
      pending: null,
    }
    const categories = await listCategories(supabase)
    const notSubscriptions = ['PAYROLL']
    const server = askInput({ ...read, not_subscriptions: ['not_subscription:PAYROLL', 'goal_ahead:x'] }, isoDate('2026-09-30'))
    // The server reads the months either side; each row it has beyond Ask's is left out by the windows.
    expect({ ...server, entries: server.entries.filter((e) => e.postedOn <= '2026-09-30') }).toEqual({
      asOf: '2026-09-30',
      historyStart: historyOf(coach),
      readFrom: '2025-09-01',
      categories: weekCategoriesForCore(categories),
      budgetHistory: budgetsForCore(await listBudgetHistory(supabase, WINDOW.to)),
      planHistory: plansForCore(await listPlanHistory(supabase, WINDOW.to, 'month')),
      entries: shopEntriesForCore(coach.rows),
      notSubscriptions,
    })
    const food = categories.find((c) => c.name === 'Groceries')?.id ?? ''
    const intents: AskIntent[] = ['spend_in', 'compare', 'top_categories', 'top_shops', 'subscriptions', 'explain_month']
    for (const intent of intents) {
      const query = { intent, period: null, categoryIds: intent === 'spend_in' || intent === 'compare' ? [food] : [], monthlyCents: null }
      const app = answerOf({ read: coach, categories, goals: [], debts: null, notSubscriptions }, query)
      expect(answerQuery({ ...server, query, forecast: null, goals: [], debts: null })).toEqual(app)
    }
  })

  it('Debts', async () => {
    const debts = [
      { id: 'd2', name: 'Card', starting_balance_cents: 50000, minimum_payment_cents: 5000, apr_basis_points: 1999, start_date: '2026-09-01', sort_order: 0 },
      { id: 'd1', name: 'Car', starting_balance_cents: 100000, minimum_payment_cents: 10000, apr_basis_points: 0, start_date: '2026-07-01', sort_order: 1 },
    ]
    const extras = [{ id: 'x1', debt_id: 'd1', month: '2026-11-01', amount_cents: 25000 }]
    const supabase = createFakeSupabase({ debts, debt_extra_payments: extras }).client
    const app = debtsForCore(await listDebts(supabase), await listDebtExtras(supabase))
    // As ai_app_read sends them: bigint columns may arrive as text.
    const server = debtsFrom(JSON.parse(JSON.stringify({ debts: debts.map((d) => ({ ...d, starting_balance_cents: String(d.starting_balance_cents) })), debt_extras: extras })))
    expect(server).toEqual(app)
    expect(server.extraPayments).toEqual([{ debtName: 'Car', month: '2026-11-01', amountCents: 25000 }])
    // debtStatus reads only the plan's schedules, so equal plans stand equally today.
    expect(debtPlan(server)).toEqual(debtPlan(app))
    expect(payoffStrategies(server)).toEqual(payoffStrategies(app))
  })
})
