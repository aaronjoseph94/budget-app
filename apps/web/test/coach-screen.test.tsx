import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** The flight goal as the owner has it: $30,000 at $275 an hour, typed, on no fund. */
function withGoal(saved: number, unitCost: number | null = 27_500): FakeSupabase {
  const fake = createFakeSupabase()
  fake.tables.savings_goals.push({
    id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: saved, target_date: null,
    unit_cost_cents: unitCost, unit_label: unitCost === null ? null : 'flight time',
  })
  return fake
}

/** A paragraph whose whole text is `s`, however it is split into spans. */
const para = (s: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === s

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

describe('the Coach’s flight card', () => {
  // Hand-derived: 12,650.00 × 60 ÷ 275.00 = 2,760 min, 46 h; 30,000.00 × 60 ÷
  // 275.00 = 6,545.45, 6,545 min, 109 h; 12,650 ÷ 30,000 = 42.17%, shown 42%.
  it('shows the hours saved of the hours the target buys, the ring and the amounts', async () => {
    go('/coach')
    renderScreen(<Shell />, withGoal(1_265_000))

    expect(await screen.findByRole('heading', { name: 'Coach', level: 1 })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Flight training', level: 2 })).toBeTruthy()
    expect(screen.getByText(para('46 h of 109 hof flight time'))).toBeTruthy()
    expect(screen.getByText(para('$12,650.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.getByText('42%')).toBeTruthy()
    expect(document.title).toBe('Coach · Budget')
  })

  // Hand-derived: 8,450.00 typed at the end of 1 September and 200.00 moved in
  // on the 5th (D16) is 8,650.00; × 60 ÷ 275.00 = 1,887.27, 1,887 min, 31 h.
  it("counts a fund's goal at the balance its transfers keep, as Savings does", async () => {
    const fake = withGoal(845_000)
    fake.tables.categories.push({ id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push({ id: 't9', posted_on: '2026-09-05', amount_cents: -20_000, merchant_raw: 'TO FLIGHT FUND', category_id: 'c4', source: 'typed' })
    Object.assign(fake.tables.savings_goals[0]!, { category_id: 'c4', start_date: null, balance_as_of: '2026-09-01' })
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(para('$8,650.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.getByText(para('31 h of 109 hof flight time'))).toBeTruthy()
  })

  it('keeps showing the amount typed when the funds cannot be read', async () => {
    const fake = withGoal(1_265_000)
    fake.fail('transactions', '42P01')
    Object.assign(fake.tables.savings_goals[0]!, { category_id: 'c4', start_date: null, balance_as_of: '2026-09-01' })
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(para('$12,650.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // Hand-derived: nothing typed at the end of 1 September and 50.00 moved out
  // of the fund on the 5th (D16) is -50.00, which buys no hours.
  it('shows no hours when more has been taken out of the fund than put in', async () => {
    const fake = withGoal(0)
    fake.tables.categories.push({ id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push({ id: 't9', posted_on: '2026-09-05', amount_cents: 5_000, merchant_raw: 'FROM FLIGHT FUND', category_id: 'c4', source: 'typed' })
    Object.assign(fake.tables.savings_goals[0]!, { category_id: 'c4', start_date: null, balance_as_of: '2026-09-01' })
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(para('-$50.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.queryByText(/ h of /)).toBeNull()
  })

  it('shows 0 h when nothing is saved yet', async () => {
    go('/coach')
    renderScreen(<Shell />, withGoal(0))

    expect(await screen.findByText(para('0 h of 109 hof flight time'))).toBeTruthy()
    expect(screen.getByText(para('$0.00 saved of $30,000.00'))).toBeTruthy()
  })

  it('shows no hours for a goal with no hourly cost', async () => {
    go('/coach')
    renderScreen(<Shell />, withGoal(1_265_000, null))

    expect(await screen.findByText(para('$12,650.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.queryByText(/ h of /)).toBeNull()
  })

  // Goals are added on Savings now (G1), not in Settings.
  it('offers to add a goal when there is none', async () => {
    go('/coach')
    renderScreen(<Shell />, createFakeSupabase())

    expect(await screen.findByText('No goal yet.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add a goal' }).getAttribute('href')).toBe('#/savings')
  })

  it('opens the check-in address as one line until the check-in is built', async () => {
    go('/coach/checkin')
    renderScreen(<Shell />, withGoal(1_265_000))

    expect(await screen.findByText('The Sunday check-in is on its way. Everything else works as before.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Flight training' })).toBeNull()
  })
})

describe('the Coach’s goals, more than one (G1)', () => {
  const other = (id: string, name: string, more: Record<string, unknown>) => ({
    id, name, target_cents: 100_000, saved_cents: 15_000, target_date: null, unit_cost_cents: null, unit_label: null, ...more,
  })

  // Hand-derived: Travel $150.00 of $1,000.00 is 1,500 bp, a bar 15% long.
  it('leads with the main goal, and lists the other active goals under it with their bars', async () => {
    const fake = withGoal(1_265_000)
    fake.tables.savings_goals.push(other('g2', 'Travel', { sort_order: 1 }), other('g3', 'House', { status: 'paused' }))
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByRole('heading', { name: 'Flight training', level: 2 })).toBeTruthy()
    expect(screen.getByText(para('46 h of 109 hof flight time'))).toBeTruthy()
    const list = screen.getByRole('heading', { name: 'Your other goals', level: 3 }).parentElement!
    expect([...list.querySelectorAll('li')].map((li) => li.querySelector('p')?.textContent)).toEqual(['Travel$150.00 of $1,000.00'])
    expect((list.querySelector('[role=presentation] > div') as HTMLElement).style.width).toBe('15%')
    expect(within(list).getByRole('link', { name: 'All your goals on Savings' }).getAttribute('href')).toBe('#/savings')
  })

  it('shows the goal made main instead, in dollars when it has no cost an hour', async () => {
    const fake = withGoal(1_265_000)
    fake.tables.savings_goals[0] = { ...fake.tables.savings_goals[0]!, sort_order: 1 }
    fake.tables.savings_goals.push(other('g2', 'Travel', { sort_order: 0 }))
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByRole('heading', { name: 'Travel', level: 2 })).toBeTruthy()
    expect(screen.getByText(para('$150.00 saved of $1,000.00'))).toBeTruthy()
    expect(screen.queryByText(/ h of /)).toBeNull()
    expect(screen.getByText('Flight training')).toBeTruthy()
  })

  it('says when no goal is active, and where to resume one', async () => {
    const fake = withGoal(1_265_000)
    fake.tables.savings_goals[0] = { ...fake.tables.savings_goals[0]!, status: 'reached', reached_on: '2026-09-01' }
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('No active goal.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Savings' }).getAttribute('href')).toBe('#/savings')
  })

  it('shows the owner’s one goal with nothing listed under it', async () => {
    go('/coach')
    renderScreen(<Shell />, withGoal(1_265_000))
    await screen.findByRole('heading', { name: 'Flight training', level: 2 })
    expect(screen.queryByRole('heading', { name: 'Your other goals' })).toBeNull()
  })
})
