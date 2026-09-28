import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YearScreen } from '../src/screens/YearScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Thursday 24 September 2026, local noon. The Year shown is January to December 2026.
const TODAY = new Date(2026, 8, 24, 12)

const cat = (id: string, name: string, kind: Category['kind']): Category => ({ id, name, kind, sort_order: 0, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})

/**
 * Hand-derived. 1 Jan – 24 Sep 2026 against 1 Jan – 24 Sep 2025. Spent
 * 100.00 + 50.00 = 150.00 against 120.00 (the 1 Oct 2025 row is past the
 * same days): 30.00 more, 3,000 × 10,000 ÷ 12,000 = 2,500 bp, 25%. Income
 * 2,000.00 against 1,500.00: 500.00 more, 33%. Saved 30.00 against nothing:
 * 30.00 more, with no percentage.
 */
function seeded(periodStart = '2025-01-01'): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('food', 'Groceries', 'variable'), cat('pay', 'Pay', 'income'), cat('fund', 'Flight fund', 'savings')],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-20T12:00:00Z', period_start: periodStart, period_end: '2026-09-20' }],
    transactions: [
      tx('t1', '2026-03-10', -10000, 'food'),
      tx('t2', '2026-09-20', -5000, 'food'),
      tx('t3', '2026-02-15', 200000, 'pay'),
      tx('t4', '2026-04-01', -3000, 'fund'),
      tx('t5', '2025-03-10', -12000, 'food'),
      tx('t6', '2025-10-01', -9000, 'food'),
      tx('t7', '2025-02-15', 150000, 'pay'),
    ],
  })
}

const card = async () => within(await screen.findByRole('group', { name: 'Compared with last year' }))
const figure = (c: ReturnType<typeof within>, label: string) => c.getByText(label, { selector: 'dt' }).nextSibling?.textContent

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the Year against last year (D26)', () => {
  it('sets the days so far against the same days a year earlier, naming both', async () => {
    renderScreen(<YearScreen start="2026-01" />, seeded())

    const c = await card()
    expect(c.getByText((_, el) => el?.tagName === 'P' && el.textContent === '1 Jan 2026 – 24 Sep 2026 against 1 Jan 2025 – 24 Sep 2025')).toBeTruthy()
    expect(figure(c, 'Spent')).toBe('$150.00 · was $120.00 · $30.00 more (25%)')
    expect(figure(c, 'Income')).toBe('$2,000.00 · was $1,500.00 · $500.00 more (33%)')
    expect(figure(c, 'Saved')).toBe('$30.00 · was $0.00 · $30.00 more')
    await expectNoAxeViolations()
  })

  it('shows no comparison when a year earlier lies before the records, and says what to import (F24)', async () => {
    renderScreen(<YearScreen start="2026-01" />, seeded('2026-08-08'))

    expect(
      (await card()).getByText('Your records start on 8 Aug 2026. Import the statement before that to compare with last year.'),
    ).toBeTruthy()
    expect(screen.queryByText(/was \$/)).toBeNull()
  })

  it('hides only the comparison when the year before cannot be read', async () => {
    const fake = seeded()
    fake.server.refuse = (table, query) =>
      table === 'transactions' && query.getAll('posted_on').includes('gte.2025-01-01') ? 'PGRST205' : null
    renderScreen(<YearScreen start="2026-01" />, fake)

    expect((await card()).getByText('Last year did not load, so there is no comparison. Reload to try again.')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Year at a glance' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
