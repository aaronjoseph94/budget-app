import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SavingsScreen } from '../src/screens/SavingsScreen.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, sort_order: number): Category => ({
  id, name, kind: 'savings', sort_order, weekly_budget_cents: null,
})

// The flight goal as Settings saved it before 0013, on no fund; and a
// Travel fund whose $100.00 typed on the 1st has had $50.00 moved in since.
function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('flight', 'Flight training', 0), cat('travel', 'Travel', 1)],
    savings_goals: [
      { id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 250_000, target_date: '2027-06-01', unit_cost_cents: 27_500, unit_label: 'flight time' },
      { id: 'g2', name: 'Travel', target_cents: 100_000, saved_cents: 10_000, target_date: null, unit_cost_cents: null, unit_label: null, category_id: 'travel', start_date: null, balance_as_of: '2026-09-01' },
    ],
    transactions: [{ id: 't1', posted_on: '2026-09-05', amount_cents: -5_000, merchant_raw: 'TO SAVINGS', category_id: 'travel', source: 'typed' }],
  })
}

const card = (name: string) => screen.findByRole('region', { name })
const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement
const type = (label: RegExp, value: string) => fireEvent.change(field(label), { target: { value } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SavingsScreen, setting and linking goals', () => {
  it('makes the goal saved before there were funds the flight fund, keeping its typed amount from today', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    fireEvent.click(within(await card('Flight training')).getByRole('button', { name: 'Use “Flight training” for this fund' }))
    expect(await screen.findByText('“Flight training” is now Flight training\'s goal.')).toBeTruthy()
    expect(fake.tables.savings_goals[0]).toMatchObject({ category_id: 'flight', balance_as_of: '2026-09-23', saved_cents: 250_000 })
    await waitFor(async () => expect(within(await card('Flight training')).queryByText('$2,500.00')).toBeTruthy())
    expect(within(await card('Travel')).queryByRole('button', { name: /^Use/ })).toBeNull()
  })

  it('edits a goal with what is saved filled in as the kept balance, and writes it as of today (N52)', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    fireEvent.click(within(await card('Travel')).getByRole('button', { name: 'Edit goal' }))
    expect(field(/^Goal \(\$\)/).value).toBe('1000.00')
    expect(field(/^Saved today/).value).toBe('150.00')
    type(/^Goal \(\$\)/, '1,200')
    type(/^Start date/, '2026-01-01')
    type(/^Goal date/, '2026-11-01')
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(await screen.findByText("Travel's goal is saved.")).toBeTruthy()
    expect(fake.tables.savings_goals[1]).toMatchObject({
      target_cents: 120_000, saved_cents: 15_000, balance_as_of: '2026-09-23', start_date: '2026-01-01', target_date: '2026-11-01',
    })
    // $1,050.00 needed over 10 months: $105.00 a month; the $50.00 is counted once.
    await waitFor(async () => expect(within(await card('Travel')).queryByText('$105.00')).toBeTruthy())
    expect(within(await card('Travel')).getByText('$150.00')).toBeTruthy()
  })

  it('sets a first goal on a fund under its name', async () => {
    const fake = seeded()
    fake.tables.savings_goals.splice(0, 1)
    fake.tables.categories.push(cat('house', 'House', 2))
    renderScreen(<SavingsScreen />, fake)
    fireEvent.click(within(await card('House')).getByRole('button', { name: 'Set a goal' }))
    expect(screen.getByRole('dialog', { name: 'Set a goal for House' })).toBeTruthy()
    type(/^Goal \(\$\)/, '5000')
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))
    await screen.findByText("House's goal is saved.")
    expect(fake.tables.savings_goals[1]).toMatchObject({ name: 'House', category_id: 'house', target_cents: 500_000, saved_cents: 0, balance_as_of: '2026-09-23' })
  })

  it('refuses an amount it cannot read, and says why the database refused one', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    fireEvent.click(within(await card('Travel')).getByRole('button', { name: 'Edit goal' }))
    type(/^Goal \(\$\)/, '0')
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(screen.getByText('Type the goal as an amount above zero, like 2000 or 2,000.00.')).toBeTruthy()
    type(/^Goal \(\$\)/, '900')
    type(/^Saved today/, 'lots')
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(screen.getByText(/^Type what is saved as an amount/)).toBeTruthy()
    type(/^Saved today/, '')
    fake.fail('PATCH savings_goals', '23514')
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(await screen.findByText(/^Only a fund on your Savings list can have a savings goal\./)).toBeTruthy()
    expect(fake.tables.savings_goals[1]).toMatchObject({ target_cents: 100_000, saved_cents: 10_000 })
  })
})
