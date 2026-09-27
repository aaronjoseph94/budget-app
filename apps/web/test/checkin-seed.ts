import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/**
 * The check-in as the database would hold it, invented data only (F42's
 * example): Sunday 27 September 2026, a statement from 1 February. Weekly
 * budgets of $70.00 on Dining out and $140.00 on Groceries; Coffee has
 * none. Last week, 21 to 27 September: $226.09 of everyday spending, $16.09
 * over and $23.91 less than the week before; Dining out cost most, $104.20,
 * with a usual month of $300.00, so its limit is $65.00. The flight goal
 * is $12,650.00 of $30,000.00 at $275.00 an hour, 46 h of 109 h.
 */
export const CHECKIN_TODAY = new Date(2026, 8, 27, 12)

export function checkinFake(): FakeSupabase {
  const cat = (id: string, name: string, kind: 'bill' | 'variable', sort_order: number, weekly_budget_cents: number | null) => ({ id, name, kind, sort_order, weekly_budget_cents })
  const row = (id: string, posted_on: string, amount_cents: number, category_id: string, merchant_raw: string) => ({ id, posted_on, amount_cents, merchant_raw, category_id, source: 'card_pdf' })
  const fake = createFakeSupabase({
    categories: [cat('dining', 'Dining out', 'variable', 1, 7_000), cat('groceries', 'Groceries', 'variable', 2, 14_000), cat('coffee', 'Coffee', 'variable', 3, null), cat('rent', 'Rent', 'bill', 4, null)],
    transactions: [
      row('coffee1', '2026-09-22', -450, 'coffee', 'CORNER CAFE'),
      row('sushi', '2026-09-23', -8_420, 'dining', 'SUSHI PLACE'),
      row('grocer', '2026-09-24', -11_240, 'groceries', 'GROCER'),
      row('cafe', '2026-09-25', -1_999, 'coffee', 'CAFE'),
      row('rent9', '2026-09-25', -150_000, 'rent', 'LANDLORD'),
      row('burger', '2026-09-26', -2_000, 'dining', 'BURGER BAR'),
      row('refund', '2026-09-26', 1_500, 'groceries', 'GROCER'),
      row('before', '2026-09-15', -25_000, 'groceries', 'GROCER'),
      ...['03', '04', '05', '06', '07', '08'].map((m) => row(`dining${m}`, `2026-${m}-10`, -30_000, 'dining', 'BISTRO')),
    ],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-27T09:00:00Z', period_start: '2026-02-01', period_end: '2026-09-27' }],
  })
  fake.tables.savings_goals.push({
    id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 1_265_000, target_date: null, unit_cost_cents: 27_500, unit_label: 'flight time',
  })
  return fake
}
