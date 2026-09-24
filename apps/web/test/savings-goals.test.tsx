import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SavingsScreen } from '../src/screens/SavingsScreen.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase, type FakeTables } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const fund = (id: string, name: string, sort_order: number): Category => ({ id, name, kind: 'savings', sort_order, weekly_budget_cents: null })
type Goal = FakeTables['savings_goals'][number]
const goal = (id: string, name: string, category_id: string | null, more: Partial<Goal> = {}): Goal => ({
  id, name, target_cents: 100_000, saved_cents: 10_000, target_date: null, unit_cost_cents: null, unit_label: null,
  category_id, start_date: null, balance_as_of: category_id === null ? null : '2026-09-01', ...more,
})

// The Savings list's order is Travel, Flight training, House; the goals'
// order is the owner's: Travel was made later but moved first (F45).
function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [fund('travel', 'Travel', 0), fund('flight', 'Flight training', 1), fund('house', 'House', 2), fund('car', 'Car', 3)],
    savings_goals: [
      goal('g1', 'Flight training', 'flight', { sort_order: 1, target_cents: 3_000_000, saved_cents: 250_000, unit_cost_cents: 27_500, unit_label: 'flight time' }),
      goal('g2', 'Travel', 'travel', { sort_order: 0 }),
    ],
  })
}

const regions = () => screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Savings, with more than one goal (G1)', () => {
  it('lists the goals in the owner’s order, the main one marked, then the funds with no goal', async () => {
    renderScreen(<SavingsScreen />, seeded())
    const travel = await screen.findByRole('region', { name: 'Travel' })
    expect(regions()).toEqual(['Travel', 'Flight training', 'House', 'Car'])
    expect(within(travel).getByText('Main goal')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Flight training' })).queryByText('Main goal')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Funds with no goal yet' })).toBeTruthy()
  })

  it('folds the paused and reached goals away, each saying which it is', async () => {
    const fake = seeded()
    fake.tables.savings_goals.push(
      goal('g3', 'House', 'house', { status: 'paused' }),
      goal('g4', 'Car', 'car', { status: 'reached', reached_on: '2026-09-01', saved_cents: 100_000 }),
    )
    renderScreen(<SavingsScreen />, fake)
    const folded = (await screen.findByText('Reached and paused (2)')).closest('details')
    expect(folded).not.toBeNull()
    expect(within(folded!).getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['House', 'Car'])
    expect(within(within(folded!).getByRole('region', { name: 'House' })).getByText('Paused')).toBeTruthy()
    expect(within(within(folded!).getByRole('region', { name: 'Car' })).getByText('Reached 1 Sep 2026')).toBeTruthy()
    // Neither leads, however early its place: the main goal is still Travel.
    expect(within(folded!).queryByText('Main goal')).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Travel' })).getByText('Main goal')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Funds with no goal yet' })).toBeNull()
  })

  it('shows a goal on no fund as its own card, apart from a fund of that name that can take it', async () => {
    const fake = seeded()
    fake.tables.savings_goals.splice(0, 1, goal('g1', 'Flight training', null, { sort_order: 1, target_cents: 3_000_000, saved_cents: 250_000 }))
    renderScreen(<SavingsScreen />, fake)
    const loose = await screen.findByRole('region', { name: 'Flight training, on no fund' })
    expect(within(loose).getByText('On no savings fund yet, so money moved to savings does not count toward it.')).toBeTruthy()
    expect(loose.textContent).toContain('$2,500.00 saved of $30,000.00')
    const flightFund = screen.getByRole('region', { name: 'Flight training' })
    expect(within(flightFund).getByRole('button', { name: 'Use “Flight training” for this fund' })).toBeTruthy()
  })

  it('shows the owner’s one goal as before, with nothing to mark as main', async () => {
    const fake = seeded()
    fake.tables.savings_goals.splice(1, 1)
    renderScreen(<SavingsScreen />, fake)
    const flight = await screen.findByRole('region', { name: 'Flight training' })
    expect(flight.textContent).toContain('$2,500.00 saved of $30,000.00')
    expect(screen.queryByText('Main goal')).toBeNull()
    expect(screen.queryByText(/^Reached and paused/)).toBeNull()
  })
})

describe('Savings, choosing the main goal and the order (G1)', () => {
  const places = (fake: FakeSupabase) => fake.tables.savings_goals.map((g) => [g.id, g.sort_order])

  it('makes the last goal the main one, putting it first and the others after it', async () => {
    const fake = seeded()
    fake.tables.savings_goals.push(goal('g3', 'House', 'house', { sort_order: 2 }))
    renderScreen(<SavingsScreen />, fake)
    fireEvent.click(within(await screen.findByRole('region', { name: 'House' })).getByRole('button', { name: 'Make main goal' }))
    expect(await screen.findByText('House is now your main goal. The Coach and the Week show it.')).toBeTruthy()
    expect(places(fake)).toEqual([['g1', 2], ['g2', 1], ['g3', 0]])
    await waitFor(() => expect(regions().slice(0, 3)).toEqual(['House', 'Travel', 'Flight training']))
    expect(within(screen.getByRole('region', { name: 'House' })).getByText('Main goal')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'House' })).queryByRole('button', { name: 'Make main goal' })).toBeNull()
  })

  it('moves a goal down among the active goals, and never past either end', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    const button = async (name: string) => within(await screen.findByRole('region', { name: 'Travel' })).getByRole<HTMLButtonElement>('button', { name })
    expect((await button('Move Travel up')).disabled).toBe(true)
    fireEvent.click(await button('Move Travel down'))
    await waitFor(() => expect(regions().slice(0, 2)).toEqual(['Flight training', 'Travel']))
    expect(places(fake)).toEqual([['g1', 0], ['g2', 1]])
    await waitFor(async () => expect((await button('Move Travel down')).disabled).toBe(true))
  })

  // Fail soft: 0015's columns are not there (42703), so the goals come in the
  // order they were made, the oldest leading, and only Edit is offered.
  it('before 0015, shows the goals as before with Edit alone, and says once why the rest wait', async () => {
    const fake = seeded()
    fake.server.lacks = { savings_goals: ['sort_order', 'status', 'reached_on'] }
    renderScreen(<SavingsScreen />, fake)
    const flight = await screen.findByRole('region', { name: 'Flight training' })
    expect(regions()).toEqual(['Flight training', 'Travel', 'House', 'Car'])
    expect(within(flight).getByText('Main goal')).toBeTruthy()
    expect(screen.getByText(/pausing or finishing one need a one-time update/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(screen.queryByRole('button', { name: 'Make main goal' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull()
    expect(within(flight).getByRole('button', { name: 'Edit goal' })).toBeTruthy()
  })
})

describe('Savings, pausing, finishing and resuming a goal (G1)', () => {
  const stored = (fake: FakeSupabase, id: string) => fake.tables.savings_goals.find((g) => g.id === id)
  const folded = async () => (await screen.findByText(/^Reached and paused/)).closest('details')!

  it('pauses the main goal: it folds away, and the next goal leads', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    fireEvent.click(within(await screen.findByRole('region', { name: 'Travel' })).getByRole('button', { name: 'Pause' }))
    expect(
      await screen.findByText(
        'Travel is paused. Money moved into its fund still counts; resume it under Reached and paused. Flight training is your main goal now.',
      ),
    ).toBeTruthy()
    expect(stored(fake, 'g2')).toMatchObject({ status: 'paused', reached_on: null })
    await waitFor(async () => expect(within(await folded()).getByRole('region', { name: 'Travel' })).toBeTruthy())
    expect(screen.queryByText('Main goal')).toBeNull()
  })

  it('marks a goal reached on the day, with a word of celebration and no motion', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    fireEvent.click(within(await screen.findByRole('region', { name: 'Flight training' })).getByRole('button', { name: 'Mark as reached' }))
    expect(await screen.findByText('You reached Flight training. Well done! It is kept under Reached and paused.')).toBeTruthy()
    expect(stored(fake, 'g1')).toMatchObject({ status: 'reached', reached_on: '2026-09-23' })
    const flight = await waitFor(async () => within(await folded()).getByRole('region', { name: 'Flight training' }))
    expect(within(flight).getByText('Reached 23 Sep 2026')).toBeTruthy()
  })

  it('resumes a paused or reached goal after every other, clearing its reached day', async () => {
    const fake = seeded()
    fake.tables.savings_goals.push(
      goal('g3', 'House', 'house', { sort_order: 0, status: 'paused' }),
      goal('g4', 'Car', 'car', { sort_order: 5, status: 'reached', reached_on: '2026-09-01' }),
    )
    renderScreen(<SavingsScreen />, fake)
    const house = within(await folded()).getByRole('region', { name: 'House' })
    expect(within(house).getByRole('button', { name: 'Mark as reached' })).toBeTruthy()
    fireEvent.click(within(house).getByRole('button', { name: 'Resume' }))
    expect(await screen.findByText('House is back among your goals, at the end.')).toBeTruthy()
    // After every goal's place, the reached Car's 5 included.
    expect(stored(fake, 'g3')).toMatchObject({ status: 'active', reached_on: null, sort_order: 6 })
    await waitFor(() => expect(regions().slice(0, 3)).toEqual(['Travel', 'Flight training', 'House']))
    const car = within(await folded()).getByRole('region', { name: 'Car' })
    expect(within(car).queryByRole('button', { name: 'Mark as reached' })).toBeNull()
    fireEvent.click(within(car).getByRole('button', { name: 'Resume' }))
    await waitFor(() => expect(stored(fake, 'g4')).toMatchObject({ status: 'active', reached_on: null, sort_order: 7 }))
  })
})
