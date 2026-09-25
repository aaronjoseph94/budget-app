import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/**
 * core's month-report example (F36) as the database would hold it,
 * invented data only: Thursday 24 September 2026, a statement from 1
 * February. Pay $4,200.00 on the 5th; Rent a planned $1,200.00 on the 1st,
 * never charged; Dining out on the 10th ($300 to $450, then $560.00 in
 * August); Groceries $380.00 on the 26th, then $300.00; $300.00 a month to
 * the Flight fund, then $500.00. Worked by hand there: August spent
 * $2,060.00, $30.00 more than July and $75.00 more than its usual month of
 * $1,985.00; Dining out $155.00 more than usual, Groceries $80.00 less.
 */
export const REPORT_TODAY = new Date(2026, 8, 24, 12)

const MONTHS = ['02', '03', '04', '05', '06', '07', '08']

export function reportFake(): FakeSupabase {
  const cat = (id: string, name: string, kind: 'income' | 'bill' | 'variable' | 'savings', sort_order = 0) =>
    ({ id, name, kind, sort_order, weekly_budget_cents: null })
  let n = 0
  const row = (posted_on: string, dollars: number, category_id: string) =>
    ({ id: `t${++n}`, posted_on, amount_cents: dollars * 100, merchant_raw: 'SHOP', category_id, source: 'typed' })
  const monthly = (category_id: string, day: string, dollars: readonly number[]) => dollars.map((d, i) => row(`2026-${MONTHS[i]!}-${day}`, d, category_id))
  return createFakeSupabase({
    categories: [cat('pay', 'Pay', 'income'), cat('rent', 'Rent', 'bill'), cat('dining', 'Dining out', 'variable'), cat('groceries', 'Groceries', 'variable', 1), cat('flight', 'Flight fund', 'savings')],
    transactions: [
      ...monthly('pay', '05', [4_200, 4_200, 4_200, 4_200, 4_200, 4_200, 4_200]),
      ...monthly('dining', '10', [-300, -420, -360, -510, -390, -450, -560]),
      ...monthly('groceries', '26', [-380, -380, -380, -380, -380, -380, -300]),
      ...monthly('flight', '15', [-300, -300, -300, -300, -300, -300, -500]),
      row('2026-09-05', 4_200, 'pay'),
      row('2026-09-10', -200, 'dining'),
    ],
    category_plans: [{ id: 'p1', category_id: 'rent', effective_month: '2026-02-01', planned_cents: 120_000, due_day: 1 }],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: '2026-02-01', period_end: '2026-09-20' }],
  })
}
