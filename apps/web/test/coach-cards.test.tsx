import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Thursday 24 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 24, 12)

const cat = (id: string, name: string): Category => ({ id, name, kind: 'variable', sort_order: 0, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})
const pending = (id: string) => ({
  id, posted_on: '2026-09-20', amount_cents: -1349, merchant: 'SYNTHETIC CAFE', merchant_raw: 'SYNTHETIC CAFE', status: 'pending',
})

/**
 * Hand-derived. Records from 1 June; the statement ends 7 Sep, 17 days ago.
 * Dining out $300.00 on the 10th of June, July and August, and $600.00 by 24
 * Sep: $300.00 more than 1–24 Aug; usual month $300.00 over 3 months, MAD 0,
 * band max($25, $45, 0) × 24 ÷ 30 = $36.00, so big. Groceries $400.00 a month
 * and $400.00 by 24 Sep: the same. The month, $1,000.00 against $700.00:
 * $300.00 more. Two charges wait in Review.
 */
function seeded(name = 'Dining out'): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('dining', name), cat('groceries', 'Groceries')],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-08T12:00:00Z', period_start: '2026-06-01', period_end: '2026-09-07' }],
    ingest_candidates: [pending('p1'), pending('p2')],
    transactions: [
      ...['06', '07', '08'].flatMap((m) => [tx(`d${m}`, `2026-${m}-10`, -30_000, 'dining'), tx(`g${m}`, `2026-${m}-12`, -40_000, 'groceries')]),
      tx('d09', '2026-09-03', -60_000, 'dining'),
      tx('g09', '2026-09-12', -40_000, 'groceries'),
    ],
  })
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** An element whose whole text is `s`, however it is split into spans. */
const whole = (tag: string, s: string) => (_: string, el: Element | null) => el?.tagName === tag && el.textContent === s

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('the Coach, in the app’s own words', () => {
  it('says how this month is going against the same days last month, with no AI, key or one-time update', async () => {
    go('/coach')
    renderScreen(<Shell />, seeded())

    expect(await screen.findByText(whole('P', 'You’ve spent $300.00 more than by this day last month. There’s still time to ease off.'))).toBeTruthy()
    expect(screen.getByText('In the app’s own words, from your records.')).toBeTruthy()
  })

  it('keeps the flight card when the records cannot be read, with one line for the rest', async () => {
    const fake = seeded()
    fake.tables.savings_goals.push({ id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 1_265_000, target_date: null, unit_cost_cents: 27_500, unit_label: 'flight time' })
    fake.fail('ingest_batches', '42P01')
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('Your insights did not load. Reload to try again; everything else still works.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Flight training' })).toBeTruthy()
    expect(screen.queryByText(/than by this day/)).toBeNull()
  })
})
