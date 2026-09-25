import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/**
 * The running example of F29 to F32 (docs/formula-decisions.md) as the
 * database would hold it, invented data only: Thursday 24 September 2026,
 * a statement from 1 June, a $2,000.00 start typed for September, pay every
 * other Friday from 5 June, Rent paid, Phone and Internet not yet, and
 * $300.00 of a $500.00 goal moved into the Flight fund. Its figures, worked
 * by hand there: the month ends near $3,310 ($3,280 to $3,340), $502.85 a
 * day is safe to spend for 7 days, and 8 October is the tightest day, at
 * $2,032.52.
 */
export const EXAMPLE_TODAY = new Date(2026, 8, 24, 12)

export function forecastFake(start: number | null = 200_000): FakeSupabase {
  const cat = (id: string, name: string, kind: 'income' | 'bill' | 'variable' | 'savings', sort_order = 0) =>
    ({ id, name, kind, sort_order, weekly_budget_cents: null })
  const row = (id: string, posted_on: string, dollars: number, category_id: string) =>
    ({ id, posted_on, amount_cents: dollars * 100, merchant_raw: 'SHOP', category_id, source: 'typed' })
  const plan = (id: string, category_id: string, planned_cents: number, due_day: number) =>
    ({ id, category_id, effective_month: '2026-06-01', planned_cents, due_day })
  return createFakeSupabase({
    categories: [
      cat('pay', 'Pay', 'income'),
      cat('rent', 'Rent', 'bill'),
      cat('phone', 'Phone', 'bill', 1),
      cat('net', 'Internet', 'bill', 2),
      cat('dining', 'Dining out', 'variable'),
      cat('flight', 'Flight fund', 'savings'),
    ],
    transactions: [
      row('t1', '2026-07-31', 1_990, 'pay'),
      row('t2', '2026-08-14', 2_080, 'pay'),
      row('t3', '2026-08-28', 2_150, 'pay'),
      row('t4', '2026-09-11', 2_100, 'pay'),
      row('t5', '2026-06-10', -900, 'dining'),
      row('t6', '2026-07-10', -1_240, 'dining'),
      row('t7', '2026-08-10', -1_054, 'dining'),
      row('t8', '2026-09-10', -840, 'dining'),
      row('t9', '2026-09-01', -1_200, 'rent'),
      row('t10', '2026-09-15', -300, 'flight'),
    ],
    category_budgets: [{ id: 'b1', category_id: 'flight', month: '2026-06-01', applies: 'onward', budget_cents: 50_000 }],
    category_plans: [plan('p1', 'rent', 120_000, 1), plan('p2', 'phone', 6_000, 28), plan('p3', 'net', 8_000, 20)],
    pay_schedules: [{ id: 's1', category_id: 'pay', first_pay_date: '2026-06-05', frequency: 'biweekly' }],
    month_balances: start === null ? [] : [{ id: 'm1', month: '2026-09-01', starting_balance_cents: start }],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: '2026-06-01', period_end: '2026-09-20' }],
  })
}
