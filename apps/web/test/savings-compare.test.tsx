import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SavingsScreen } from '../src/screens/SavingsScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Thursday 24 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 24, 12)

const cat = (id: string, name: string, kind: Category['kind']): Category => ({ id, name, kind, sort_order: 0, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'To savings', category_id, source: 'typed',
})

/**
 * Hand-derived. Into the flight fund 1–24 Sep: 125.00. 1–24 Aug: 50.00; the
 * 28 Aug move is past the same days. The emergency fund: 20.00 against
 * nothing. In total 145.00 against 50.00: 95.00 more, 9,500 × 10,000 ÷
 * 5,000 = 19,000 bp, 190%. The flight fund alone: 75.00 more, 150%.
 */
function seeded(periodStart = '2026-07-01'): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('flight', 'Flight training', 'savings'), cat('rainy', 'Emergency', 'savings'), cat('food', 'Groceries', 'variable')],
    savings_goals: [
      {
        id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 250_000, target_date: '2028-01-01',
        unit_cost_cents: null, unit_label: null, category_id: 'flight', start_date: '2026-01-01', balance_as_of: '2026-08-31',
      },
    ],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-20T12:00:00Z', period_start: periodStart, period_end: '2026-09-20' }],
    transactions: [
      tx('t1', '2026-09-10', -12500, 'flight'),
      tx('t2', '2026-08-12', -5000, 'flight'),
      tx('t3', '2026-08-28', -9000, 'flight'),
      tx('t4', '2026-09-11', -2000, 'rainy'),
      tx('t5', '2026-09-12', -4000, 'food'),
    ],
  })
}

const text = (s: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === s
const total = async () => within(await screen.findByRole('group', { name: 'Compared with last month' }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Savings, saved this month against last (D26)', () => {
  it('sets what was saved so far against the same days last month, in total and for each fund', async () => {
    renderScreen(<SavingsScreen />, seeded())

    const t = await total()
    expect(t.getByText(text('1 – 24 Sep: $145.00 saved · 1 – 24 Aug: $50.00'))).toBeTruthy()
    expect(t.getByText(text('▲ $95.00 more (190%)'))).toBeTruthy()
    const fund = within(await screen.findByRole('group', { name: 'Flight training compared with last month' }))
    expect(fund.getByText(text('1 – 24 Sep: $125.00 saved · 1 – 24 Aug: $50.00'))).toBeTruthy()
    expect(fund.getByText(text('▲ $75.00 more (150%)'))).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('says which statement to import when last month starts before the records, with no fund lines (F24)', async () => {
    renderScreen(<SavingsScreen />, seeded('2026-08-08'))

    expect(
      (await total()).getByText('Your records start on 8 Aug. Import the statement before that to compare with last month.'),
    ).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Flight training compared with last month' })).toBeNull()
  })

  it('hides only the comparison when last month cannot be read, and the funds still show', async () => {
    const fake = seeded()
    fake.server.refuse = (table, query) =>
      table === 'transactions' && query.getAll('posted_on').includes('gte.2026-08-01') ? '42703' : null
    renderScreen(<SavingsScreen />, fake)

    expect((await total()).getByText('Last month did not load, so there is no comparison.', { exact: false })).toBeTruthy()
    // 2,500.00 typed on 31 Aug, and 125.00 moved in since.
    expect(within(await screen.findByRole('region', { name: 'Flight training' })).getByText('$2,625.00')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
