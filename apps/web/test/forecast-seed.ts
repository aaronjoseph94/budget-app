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

/**
 * The same, with two goals, worked by hand from F33 to F35. Flight
 * training, $12,650.00 of $30,000.00 at $275.00 an hour, had $400.00,
 * $500.00 and $300.00 moved in from June to August: $69.23, $92.31 and
 * $115.38 a week, so 251, 188 and 151 weeks. Emergency, $520.00 of
 * $1,000.00, had nothing moved in. Dining out's usual month is $1,054.00:
 * a quarter is $265.00, a tenth $105.00 and its best month $155.00.
 */
export function forecastFakeWithGoals(): FakeSupabase {
  const fake = forecastFake()
  const move = (id: string, posted_on: string, dollars: number) =>
    ({ id, posted_on, amount_cents: -dollars * 100, merchant_raw: 'SHOP', category_id: 'flight', source: 'typed' })
  fake.tables.categories.push({ id: 'emerg', name: 'Emergency fund', kind: 'savings', sort_order: 1, weekly_budget_cents: null })
  fake.tables.transactions.push(move('f1', '2026-06-15', 400), move('f2', '2026-07-15', 500), move('f3', '2026-08-15', 300))
  const goal = { target_date: null, start_date: null, balance_as_of: '2026-09-20', status: 'active' as const, reached_on: null }
  fake.tables.savings_goals.push(
    { ...goal, id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 1_265_000, unit_cost_cents: 27_500, unit_label: 'flight time', category_id: 'flight', sort_order: 0 },
    { ...goal, id: 'g2', name: 'Emergency', target_cents: 100_000, saved_cents: 52_000, unit_cost_cents: null, unit_label: null, category_id: 'emerg', sort_order: 1 },
  )
  return fake
}
