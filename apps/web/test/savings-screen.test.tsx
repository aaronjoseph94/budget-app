import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SavingsScreen } from '../src/screens/SavingsScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, kind: Category['kind'], sort_order: number): Category => ({
  id, name, kind, sort_order, weekly_budget_cents: null,
})
const moved = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'TO SAVINGS', category_id, source: 'typed',
})

// Hand-derived. Flight training: $2,500.00 typed at the end of 1 Sep; $150.00
// moved in on the 1st (already typed), $200.00 on the 10th and $50.00 on the
// 30th (after today): $2,700.00 of $30,000.00, 900 bp, $27,300.00 needed.
// 1 Jan 2026 → 1 Jan 2028 is 24 months: 2,730,000 / 24 = 113,750, $1,137.50.
// At $275.00 an hour, $27,300.00 is 99 whole hours.
// Travel: $1,000.00 of $1,000.00 with no dates: reached, no monthly figure.
function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      cat('travel', 'Travel <b>fund</b>', 'savings', 2),
      cat('flight', 'Flight training', 'savings', 1),
      cat('house', 'House', 'savings', 3),
      cat('food', 'Groceries', 'variable', 0),
    ],
    savings_goals: [
      {
        id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 250_000, target_date: '2028-01-01',
        unit_cost_cents: 27_500, unit_label: 'flight time', category_id: 'flight', start_date: '2026-01-01', balance_as_of: '2026-09-01',
      },
      {
        id: 'g2', name: 'Travel', target_cents: 100_000, saved_cents: 100_000, target_date: null,
        unit_cost_cents: null, unit_label: null, category_id: 'travel', start_date: null, balance_as_of: '2026-09-20',
      },
    ],
    transactions: [
      moved('t1', '2026-09-01', -15_000, 'flight'),
      moved('t2', '2026-09-10', -20_000, 'flight'),
      moved('t3', '2026-09-30', -5_000, 'flight'),
      moved('t4', '2026-09-12', -9_999, 'food'),
    ],
  })
}

const card = async (name: string) => screen.findByRole('region', { name })
const lines = (region: HTMLElement) => [...region.querySelectorAll('h2, p, dt, dd')].map((e) => e.textContent)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SavingsScreen', () => {
  it('gives every goal, then every Savings-list fund with no goal, a card, and no other list one', async () => {
    renderScreen(<SavingsScreen />, seeded())
    await card('Flight training')
    const names = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(names).toEqual(['Flight training', 'Travel <b>fund</b>', 'House'])
    // A name is text, never markup.
    expect(screen.getByRole('heading', { name: 'Travel <b>fund</b>' })).toBeTruthy()
    await expectNoAxeViolations()
  })

  it("shows a fund's goal, its balance kept by transfers, what it needs, and a month's share", async () => {
    renderScreen(<SavingsScreen />, seeded())
    expect(lines(await card('Flight training'))).toEqual([
      'Flight training',
      '$2,700.00 saved of $30,000.00',
      'Amount needed',
      'Start date', '1 Jan 2026',
      'Goal date', '1 Jan 2028',
      'Months remaining', '24',
      'Monthly contribution', '$1,137.50',
      '$2,500.00 typed on 1 Sep 2026, and $200.00 moved in since.',
      'About 99 hours of flight time to go.',
    ])
    expect(within(await card('Flight training')).getByText('9%')).toBeTruthy()
    expect(within(await card('Flight training')).getByText('$27,300.00')).toBeTruthy()
  })

  it('says why there is no monthly figure, where the workbook shows $0 (D15), and when a goal is reached', async () => {
    renderScreen(<SavingsScreen />, seeded())
    const travel = await card('Travel <b>fund</b>')
    expect(lines(travel)).toContain('Amount needed · goal reached')
    expect(lines(travel)).toContain('No dates yet. Add a start date and a goal date to see what to save each month.')
    expect(within(travel).getAllByText('—')).toHaveLength(2)
    expect(within(travel).getByText('100%')).toBeTruthy()
    expect(lines(await card('House'))).toEqual(['House', 'No goal yet.'])
  })

  it('words money taken back out of a fund plainly, never as a negative amount moved in', async () => {
    const fake = seeded()
    // Hand-derived: $30.00 back out of Travel on the 21st, after its day (the 20th).
    fake.tables.transactions.push(moved('t5', '2026-09-21', 3_000, 'travel'))
    renderScreen(<SavingsScreen />, fake)
    const travel = await card('Travel <b>fund</b>')
    expect(lines(travel)).toContain(
      '$1,000.00 typed on 20 Sep 2026; since then, more was taken out than moved in, a change of -$30.00.',
    )
    expect(travel.textContent).not.toMatch(/moved in since/)
  })

  it('says when the Savings list is empty, and where to add to it', async () => {
    renderScreen(<SavingsScreen />, createFakeSupabase({ categories: [cat('food', 'Groceries', 'variable', 0)] }))
    expect(await screen.findByText('Your Savings list has no funds yet. Each fund on it gets a card here.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add funds in Setup' })).toBeTruthy()
  })

  it('says which update is missing when 0013 is not applied', async () => {
    const fake = seeded()
    // The shared load's goal read names only 0004's columns and still works
    // before 0013; the Savings screen's own read, which comes after it, does not.
    fake.server.afterRead = (table) => {
      if (table === 'savings_goals') fake.fail('savings_goals', '42703')
    }
    renderScreen(<SavingsScreen />, fake)
    expect(await screen.findByText(/need a one-time update, so your funds cannot be shown/)).toBeTruthy()
  })
})
