import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SavingsScreen } from '../src/screens/SavingsScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase, type FakeTables } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const category = (id: string, name: string, kind: Category['kind']): Category => ({ id, name, kind, sort_order: 0, weekly_budget_cents: null })
type Goal = FakeTables['savings_goals'][number]
const goal = (id: string, name: string, category_id: string, more: Partial<Goal>): Goal => ({
  id, name, target_cents: 100_000, saved_cents: 10_000, target_date: null, unit_cost_cents: null, unit_label: null,
  category_id, start_date: null, balance_as_of: '2026-09-01', ...more,
})
const row = (id: string, posted_on: string, dollars: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents: -dollars * 100, merchant_raw: 'SYNTHETIC', category_id, source: 'typed',
})

/**
 * Hand-derived (F33, F34). Records from 1 May. Dining out $300.00, $420.00,
 * $360.00 and $510.00 from May to August: usual $390.00, a quarter $97.50,
 * so $100.00, $23.08 a week. Flight training, $12,650.00 of $30,000.00, had
 * $400.00, $650.00, $500.00 and $300.00 moved in: a middle pace of $103.85 a
 * week, so 168 − 137 = 31 weeks sooner and 22 minutes of flight time a month.
 * Travel, $100.00 of $1,000.00, had nothing moved in: $900.00 ÷ $23.08 is 39
 * weeks on the lever alone. House is paused.
 */
function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      category('flight', 'Flight training', 'savings'),
      category('travel', 'Travel', 'savings'),
      category('house', 'House', 'savings'),
      category('dining', 'Dining out', 'variable'),
    ],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: '2026-05-01', period_end: '2026-09-20' }],
    transactions: [
      row('f1', '2026-05-15', 400, 'flight'),
      row('f2', '2026-06-15', 650, 'flight'),
      row('f3', '2026-07-15', 500, 'flight'),
      row('f4', '2026-08-15', 300, 'flight'),
      row('d1', '2026-05-10', 300, 'dining'),
      row('d2', '2026-06-10', 420, 'dining'),
      row('d3', '2026-07-10', 360, 'dining'),
      row('d4', '2026-08-10', 510, 'dining'),
    ],
    savings_goals: [
      goal('g1', 'Flight training', 'flight', { sort_order: 0, target_cents: 3_000_000, saved_cents: 1_265_000, unit_cost_cents: 27_500, unit_label: 'flight time' }),
      goal('g2', 'Travel', 'travel', { sort_order: 1 }),
      goal('g3', 'House', 'house', { sort_order: 2, status: 'paused' }),
    ],
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('what to trim, on each active goal’s Savings card (A08, F34)', () => {
  it('gives each active goal its top lever, in its own unit or in weeks alone', async () => {
    renderScreen(<SavingsScreen />, seeded())

    const flight = await screen.findByRole('region', { name: 'Flight training' })
    expect(
      await within(flight).findByText('Trim Dining out by $100.00 a month to get there 31 weeks sooner. That’s 22 min of flight time a month.'),
    ).toBeTruthy()
    const travel = screen.getByRole('region', { name: 'Travel' })
    expect(within(travel).getByText('Trim Dining out by $100.00 a month, and that alone gets you there in 39 weeks.')).toBeTruthy()
  })

  it('gives a paused goal no lever', async () => {
    renderScreen(<SavingsScreen />, seeded())

    await screen.findByText(/^Trim Dining out by \$100\.00 a month to get there/)
    const house = screen.getByRole('region', { name: 'House' })
    expect(within(house).queryByText(/^Trim /)).toBeNull()
  })

  it('keeps every card when the year of records cannot be read, with no lever', async () => {
    const fake = seeded()
    fake.fail('ingest_batches', '42P01')
    renderScreen(<SavingsScreen />, fake)

    expect(await screen.findByRole('region', { name: 'Flight training' })).toBeTruthy()
    expect(screen.queryByText(/^Trim /)).toBeNull()
  })
})
