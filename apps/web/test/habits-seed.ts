import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/**
 * Habits as the database would hold them, invented data only (F40):
 * Thursday 24 September 2026, a statement from 1 February. Weekly budgets
 * of $70.00 on Dining out and $140.00 on Groceries, $30.00 a day; Coffee
 * has none. Groceries $60.00 every Saturday; Dining out once a month on
 * the 12th, lowest in August; Coffee $5.00 this Monday; Rent on the 1st,
 * a bill, never everyday spending. Worked by hand in the Habits tests.
 */
export const HABITS_TODAY = new Date(2026, 8, 24, 12)
const DINING: Readonly<Record<string, number>> = { '02': 300, '03': 320, '04': 280, '05': 350, '06': 310, '07': 330, '08': 250 }

export function habitsFake(periodStart = '2026-02-01', budgets = true): FakeSupabase {
  const cat = (id: string, name: string, kind: 'bill' | 'variable', sort_order: number, weekly: number | null) => ({
    id,
    name,
    kind,
    sort_order,
    weekly_budget_cents: budgets ? weekly : null,
  })
  let n = 0
  const row = (posted_on: string, dollars: number, category_id: string) => ({ id: `t${++n}`, posted_on, amount_cents: -dollars * 100, merchant_raw: 'SHOP', category_id, source: 'typed' })
  const saturdays: string[] = []
  for (let day = new Date(Date.UTC(2026, 1, 7)); day <= new Date(Date.UTC(2026, 8, 19)); day.setUTCDate(day.getUTCDate() + 7)) {
    saturdays.push(day.toISOString().slice(0, 10))
  }
  return createFakeSupabase({
    categories: [cat('dining', 'Dining out', 'variable', 1, 7_000), cat('groceries', 'Groceries', 'variable', 2, 14_000), cat('coffee', 'Coffee', 'variable', 3, null), cat('rent', 'Rent', 'bill', 4, null)],
    transactions: [
      ...saturdays.map((d) => row(d, 60, 'groceries')),
      ...Object.entries(DINING).map(([m, dollars]) => row(`2026-${m}-12`, dollars, 'dining')),
      ...['02', '03', '04', '05', '06', '07', '08', '09'].map((m) => row(`2026-${m}-01`, 1_200, 'rent')),
      row('2026-09-21', 5, 'coffee'),
    ].filter((r) => r.posted_on >= periodStart),
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: periodStart, period_end: '2026-09-20' }],
  })
}
