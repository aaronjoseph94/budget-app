import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/**
 * Invented records for the Shops tab and the Setup nudge (plan A17; F38,
 * F39, F41): a statement from 1 February, and on Thursday 24 September 2026
 * SPOTIFY's price up on the 14th, GYM a new monthly charge, $180.00 at CAFE
 * far above Dining out's usual, $450.00 at FURNITURE CO (a new shop),
 * COFFEE HOUSE's $4.50 twice, and a typed $6.25 that TEA ROOM's statement
 * line matches. Each descriptor is as a statement writes it; the app
 * normalises it ("SPOTIFY 1234567" is SPOTIFY).
 */
export const SHOPS_TODAY = new Date(2026, 8, 24, 12)

const cat = (id: string, name: string, kind: Category['kind'], sort_order: number): Category => ({ id, name, kind, sort_order, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string, merchant_raw: string, source = 'card_pdf'): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw, category_id, source,
})
const WEEKLY = ['07-04', '07-11', '07-18', '07-25', '08-01', '08-08', '08-15', '08-22', '08-29', '09-05', '09-12', '09-19']

const SHOP_CATEGORIES: readonly Category[] = [
  cat('music', 'Music', 'subscription', 1),
  cat('dining', 'Dining out', 'variable', 2),
  cat('fitness', 'Fitness', 'variable', 3),
  cat('home', 'Home', 'variable', 4),
]

export const SHOP_ROWS: readonly LedgerRow[] = [
  ...['05', '06', '07', '08'].map((m) => tx(`s${m}`, `2026-${m}-14`, -1_199, 'music', 'SPOTIFY 1234567')),
  tx('s09', '2026-09-14', -1_299, 'music', 'SPOTIFY 7654321'),
  ...['07', '08', '09'].map((m) => tx(`g${m}`, `2026-${m}-20`, -4_500, 'fitness', 'GYM')),
  ...WEEKLY.map((day, i) => tx(`c${i}`, `2026-${day}`, -2_500, 'dining', 'SQ *CAFE')),
  tx('big', '2026-09-20', -18_000, 'dining', 'SQ *CAFE'),
  tx('sofa', '2026-09-12', -45_000, 'home', 'FURNITURE CO'),
  tx('k1', '2026-09-21', -450, 'dining', 'COFFEE HOUSE'),
  tx('k2', '2026-09-23', -450, 'dining', 'COFFEE HOUSE'),
  tx('t1', '2026-09-22', -625, 'dining', 'tea', 'typed'),
  tx('t2', '2026-09-23', -625, 'dining', 'TEA ROOM'),
]

export function shopsFake(): FakeSupabase {
  return createFakeSupabase({
    categories: [...SHOP_CATEGORIES],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-23T12:00:00Z', period_start: '2026-02-01', period_end: '2026-09-23' }],
    transactions: [...SHOP_ROWS],
  })
}
