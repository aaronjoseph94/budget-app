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

describe('Savings, removing a goal (G1)', () => {
  it('refuses to remove a goal holding money, and says why and what to do instead', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    const travel = await screen.findByRole('region', { name: 'Travel' })
    fireEvent.click(within(travel).getByRole('button', { name: 'Remove' }))
    expect(within(travel).getByRole('alert').textContent).toBe(
      'Travel holds $100.00, so removing it would lose the record of that balance. Pause it or mark it reached instead. If that money is gone, edit the goal to say nothing is saved, then remove it.',
    )
    expect(within(travel).queryByRole('button', { name: 'Remove goal' })).toBeNull()
    expect(fake.tables.savings_goals).toHaveLength(2)
  })

  it('removes a goal with nothing saved after one confirmation, and keeps its fund', async () => {
    const fake = seeded()
    fake.tables.savings_goals.push(goal('g3', 'House', 'house', { sort_order: 2, saved_cents: 0 }))
    renderScreen(<SavingsScreen />, fake)
    const house = await screen.findByRole('region', { name: 'House' })
    fireEvent.click(within(house).getByRole('button', { name: 'Remove' }))
    expect(within(house).getByText('Remove House? Its fund stays on your Savings list, with everything filed under it.')).toBeTruthy()
    fireEvent.click(within(house).getByRole('button', { name: 'Keep it' }))
    expect(within(house).queryByRole('button', { name: 'Remove goal' })).toBeNull()
    fireEvent.click(within(house).getByRole('button', { name: 'Remove' }))
    fireEvent.click(within(house).getByRole('button', { name: 'Remove goal' }))
    expect(await screen.findByText('Removed House. Its fund stays on your Savings list; remove it in Setup if you no longer need it.')).toBeTruthy()
    expect(fake.tables.savings_goals.map((g) => g.id)).toEqual(['g1', 'g2'])
    expect(fake.tables.categories.map((c) => c.id)).toContain('house')
    await waitFor(() => expect(regions()).toEqual(['Travel', 'Flight training', 'House', 'Car']))
    expect(within(screen.getByRole('region', { name: 'House' })).getByRole('button', { name: 'Set a goal' })).toBeTruthy()
  })

  it('still removes an empty goal before 0015, which a delete does not need', async () => {
    const fake = seeded()
    fake.tables.savings_goals.push(goal('g3', 'House', 'house', { saved_cents: 0 }))
    fake.server.lacks = { savings_goals: ['sort_order', 'status', 'reached_on'] }
    renderScreen(<SavingsScreen />, fake)
    const house = await screen.findByRole('region', { name: 'House' })
    fireEvent.click(within(house).getByRole('button', { name: 'Remove' }))
    fireEvent.click(within(house).getByRole('button', { name: 'Remove goal' }))
    await waitFor(() => expect(fake.tables.savings_goals.map((g) => g.id)).toEqual(['g1', 'g2']))
  })
})

describe('Savings, adding a goal (G1)', () => {
  const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
  const add = async (fields: Readonly<Record<string, string>>) => {
    fireEvent.click(await screen.findByRole('button', { name: 'Add a goal' }))
    expect(screen.getByRole('dialog', { name: 'Add a goal' })).toBeTruthy()
    for (const [label, value] of Object.entries(fields)) type(new RegExp(`^${label}`), value)
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
  }

  // The acceptance: added in one sheet, its fund made, and money moved in afterwards counted.
  it('makes the goal and its fund together, and counts money moved in after today', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    await add({ Name: 'Emergency', 'Target \\(\\$\\)': '5000', 'Saved already': '200', 'Target date': '2027-09-01' })
    expect(await screen.findByText('Emergency is added, with its fund on your Savings list. Money you move into it after today adds to it.')).toBeTruthy()
    const made = fake.tables.categories.find((c) => c.name === 'Emergency')
    expect(made).toMatchObject({ kind: 'savings', sort_order: 4 })
    expect(fake.tables.savings_goals[2]).toMatchObject({
      name: 'Emergency', category_id: made?.id, target_cents: 500_000, saved_cents: 20_000,
      target_date: '2027-09-01', start_date: '2026-09-23', balance_as_of: '2026-09-23', sort_order: 2,
    })
    // Two days on, $50.00 moved in on the 24th adds to what was typed.
    cleanup()
    vi.setSystemTime(new Date(2026, 8, 25, 12))
    fake.tables.transactions.push({ id: 't9', posted_on: '2026-09-24', amount_cents: -5_000, merchant_raw: 'TO SAVINGS', category_id: made!.id, source: 'typed' })
    renderScreen(<SavingsScreen />, fake)
    expect((await screen.findByRole('region', { name: 'Emergency' })).textContent).toContain('$250.00 saved of $5,000.00')
    expect(regions().slice(0, 3)).toEqual(['Travel', 'Flight training', 'Emergency'])
  })

  it('uses the Savings fund of that name when it has no goal, rather than making another', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    await add({ Name: 'House', 'Target \\(\\$\\)': '40000' })
    await screen.findByText(/^House is added/)
    expect(fake.tables.categories.filter((c) => c.name === 'House')).toHaveLength(1)
    expect(fake.tables.savings_goals[2]).toMatchObject({ name: 'House', category_id: 'house', saved_cents: 0, target_date: null, start_date: null })
  })

  it('says why before writing anything: a name on another list, a goal already there, a target that is not money', async () => {
    const fake = seeded()
    fake.tables.categories.push({ id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null })
    renderScreen(<SavingsScreen />, fake)
    await add({ Name: 'Groceries', 'Target \\(\\$\\)': '100' })
    expect(screen.getByText('Groceries is on your Variable expenses list. Use another name, or move it to Savings in Setup.')).toBeTruthy()
    type(/^Name/, 'Travel')
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    expect(screen.getByText('You already have a goal called Travel. Edit it on its card, or use another name.')).toBeTruthy()
    type(/^Name/, 'Boat')
    type(/^Target \(\$\)/, '0')
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    expect(screen.getByText('Type the target as an amount above zero, like 2000 or 2,000.00.')).toBeTruthy()
    expect(fake.tables.savings_goals).toHaveLength(2)
    expect(fake.tables.categories).toHaveLength(5)
  })

  // Fail soft: before 0015 there is no place to write, and a goal is added as before.
  it('adds a goal before 0015 without a place, which the database would refuse', async () => {
    const fake = seeded()
    fake.server.lacks = { savings_goals: ['sort_order', 'status', 'reached_on'] }
    renderScreen(<SavingsScreen />, fake)
    await add({ Name: 'Emergency', 'Target \\(\\$\\)': '5000' })
    expect(await screen.findByText(/^Emergency is added/)).toBeTruthy()
    expect(fake.tables.savings_goals[2]).toMatchObject({ name: 'Emergency', target_cents: 500_000 })
    expect('sort_order' in fake.tables.savings_goals[2]!).toBe(false)
  })
})

describe('Savings, showing a goal in dollars or in hours (G1, F45)', () => {
  const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

  // Hand-derived: $900.00 at $45.00 an hour, nothing saved, is 20 hours to go.
  it('adds a goal counted in hours of something, at what an hour costs', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a goal' }))
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Dollars' }).checked).toBe(true)
    type(/^Name/, 'Guitar')
    type(/^Target \(\$\)/, '900')
    fireEvent.click(screen.getByRole('radio', { name: 'Hours' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    expect(screen.getByText('Type what an hour costs, like 275 or 275.00.')).toBeTruthy()
    type(/^Cost of an hour/, '45')
    type(/^Hours of/, 'guitar lessons')
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    await screen.findByText(/^Guitar is added/)
    expect(fake.tables.savings_goals[2]).toMatchObject({ name: 'Guitar', unit_cost_cents: 4_500, unit_label: 'guitar lessons' })
    await waitFor(async () => expect((await screen.findByRole('region', { name: 'Guitar' })).textContent).toContain('About 20 hours of guitar lessons to go.'))
  })

  it('edits a goal from hours back to dollars', async () => {
    const fake = seeded()
    renderScreen(<SavingsScreen />, fake)
    fireEvent.click(within(await screen.findByRole('region', { name: 'Flight training' })).getByRole('button', { name: 'Edit goal' }))
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Hours' }).checked).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>(/^Cost of an hour/).value).toBe('275.00')
    expect(screen.getByLabelText<HTMLInputElement>(/^Hours of/).value).toBe('flight time')
    fireEvent.click(screen.getByRole('radio', { name: 'Dollars' }))
    expect(screen.queryByLabelText(/^Cost of an hour/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))
    await screen.findByText("Flight training's goal is saved.")
    expect(fake.tables.savings_goals[0]).toMatchObject({ unit_cost_cents: null, unit_label: null })
  })
})
