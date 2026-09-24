import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Thursday 24 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 24, 12)

const cat = (id: string, name: string, kind: Category['kind']): Category => ({
  id, name, kind, sort_order: 0, weekly_budget_cents: null,
})
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})
const batch = (id: string, period_start: string, period_end: string) => ({
  id, source: 'card_pdf' as const, created_at: `${period_end}T12:00:00Z`, period_start, period_end,
})

/**
 * Hand-derived. 1–24 Sep: groceries 900.00 + dining 120.00 = 1,020.00.
 * 1–24 Aug: groceries 1,000.00 + dining 180.00 = 1,180.00; the 30 Aug row is
 * after the 24th and left out. Change −160.00; 16,000 × 10,000 ÷ 118,000 =
 * 1,356 bp, shown as 14%. The statements start on 1 July, before August.
 */
function seeded(periodStart = '2026-07-01'): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('groceries', 'Groceries', 'variable'), cat('dining', 'Dining out', 'variable')],
    ingest_batches: [batch('b1', periodStart, '2026-09-20')],
    transactions: [
      tx('t1', '2026-09-03', -90000, 'groceries'),
      tx('t2', '2026-09-12', -12000, 'dining'),
      tx('t3', '2026-08-04', -100000, 'groceries'),
      tx('t4', '2026-08-20', -18000, 'dining'),
      tx('t5', '2026-08-30', -50000, 'dining'),
    ],
  })
}

const strip = async () => within(await screen.findByRole('group', { name: 'Compared with last month' }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the Month beside last month (D26)', () => {
  it('names both same-days figures, both dates and the change in words', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())

    const s = await strip()
    expect(s.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'By 24 Sep: $1,020.00 spent · by 24 Aug: $1,180.00')).toBeTruthy()
    expect(s.getByText((_, el) => el?.tagName === 'P' && el.textContent === '▼ $160.00 less (14%)')).toBeTruthy()
    // The Month's own Spent is the whole month, and has no change under it.
    expect(within(screen.getByRole('region', { name: 'Summary' })).getAllByText('$1,020.00')).toHaveLength(2)
  })

  it('names both months for a month already over', async () => {
    renderScreen(<MonthScreen month="2026-08" />, seeded())

    // August 1,000.00 + 180.00 + 500.00 against a July with nothing.
    expect((await strip()).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'August: $1,680.00 spent · July: $0.00')).toBeTruthy()
    expect((await strip()).getByText((_, el) => el?.tagName === 'P' && el.textContent === '▲ $1,680.00 more')).toBeTruthy()
  })

  it('says which statement to import when last month starts before the records (F24)', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded('2026-08-08'))

    expect(
      (await strip()).getByText('Your records start on 8 Aug. Import the statement before that to compare with August.'),
    ).toBeTruthy()
  })

  it('hides the comparison with one line when last month cannot be read, and still shows the month', async () => {
    const fake = seeded()
    fake.server.refuse = (table, query) =>
      table === 'transactions' && query.getAll('posted_on').includes('gte.2026-08-01') ? 'PGRST205' : null
    renderScreen(<MonthScreen month="2026-09" />, fake)

    expect((await strip()).getByText('Last month did not load, so there is no comparison. Reload to try again.')).toBeTruthy()
    expect(screen.queryByText(/by 24 Aug/)).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Variable expenses' })).getByRole('rowheader', { name: 'Groceries' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
