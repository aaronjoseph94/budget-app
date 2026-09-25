import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/**
 * core's trends example (F37) as the database would hold it, invented data
 * only: Thursday 24 September 2026, a statement from 1 March. Pay $4,000.00
 * on the 5th; Rent a planned $1,200.00, never charged; Dining out rises
 * steadily ($300 to $450), Books falls ($100 to $50), Coffee wanders; $200.00
 * a month to the fund, then $500.00. Worked by hand in trends.test.ts.
 */
export const TRENDS_TODAY = new Date(2026, 8, 24, 12)
const SPENT: Readonly<Record<string, readonly number[]>> = {
  dining: [300, 340, 330, 380, 420, 450],
  coffee: [60, 62, 59, 61, 60, 63],
  books: [100, 90, 80, 70, 60, 50],
}

export function trendsFake(periodStart = '2026-03-01'): FakeSupabase {
  const cat = (id: string, name: string, kind: 'income' | 'bill' | 'variable' | 'savings', sort_order = 0) => ({ id, name, kind, sort_order, weekly_budget_cents: null })
  let n = 0
  const row = (posted_on: string, dollars: number, category_id: string) => ({ id: `t${++n}`, posted_on, amount_cents: dollars * 100, merchant_raw: 'SHOP', category_id, source: 'typed' })
  const months = ['03', '04', '05', '06', '07', '08']
  return createFakeSupabase({
    categories: [
      cat('pay', 'Pay', 'income'),
      cat('rent', 'Rent', 'bill'),
      cat('coffee', 'Coffee', 'variable'),
      cat('dining', 'Dining out', 'variable', 1),
      cat('books', 'Books', 'variable', 2),
      cat('fund', 'Flight fund', 'savings'),
    ],
    transactions: months.flatMap((m, i) => [
      row(`2026-${m}-05`, 4_000, 'pay'),
      ...Object.entries(SPENT).map(([id, dollars]) => row(`2026-${m}-12`, -dollars[i]!, id)),
      row(`2026-${m}-15`, i === 5 ? -500 : -200, 'fund'),
    ]),
    category_plans: [{ id: 'p1', category_id: 'rent', effective_month: '2026-03-01', planned_cents: 120_000, due_day: 1 }],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: periodStart, period_end: '2026-09-20' }],
  })
}
