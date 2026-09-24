import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAppData } from '../src/app-data.js'
import { createFakeSupabase, type FakeTables } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

afterEach(cleanup)

type Goal = FakeTables['savings_goals'][number]
const goal = (id: string, name: string, more: Partial<Goal> = {}): Goal => ({
  id, name, target_cents: 100_000, saved_cents: 0, target_date: null, unit_cost_cents: null, unit_label: null, ...more,
})

/** What the shared load gives every screen: its state, the main goal, every goal in order, and whether 0015 is in. */
function Goals() {
  const { status, mainGoal, goals, goalsOrdered } = useAppData()
  return (
    <p data-testid="goals">
      {status}: {mainGoal === null ? 'no main goal' : mainGoal.name} · {goals.map((g) => g.name).join(', ')} ·{' '}
      {goalsOrdered ? 'ordered' : 'needs 0015'}
    </p>
  )
}

const said = (text: string) => waitFor(() => expect(screen.getByTestId('goals').textContent).toBe(text))

describe('the shared load, reading every savings goal (F45)', () => {
  it('leads with the first active goal in the owner’s order, then lists the paused and reached ones', async () => {
    // Made in this order; Travel was chosen as the main goal, House paused
    // and Car marked reached, each at a place that would lead if it counted.
    const fake = createFakeSupabase({
      savings_goals: [
        goal('g1', 'Flight training', { sort_order: 1 }),
        goal('g2', 'House', { sort_order: 0, status: 'paused' }),
        goal('g3', 'Travel', { sort_order: 0 }),
        goal('g4', 'Car', { sort_order: 0, status: 'reached', reached_on: '2026-09-01' }),
      ],
    })
    renderScreen(<Goals />, fake)
    await said('ready: Travel · Travel, Flight training, House, Car · ordered')
  })

  it('leads with the oldest when every goal shares a place, as the one goal read before did', async () => {
    renderScreen(<Goals />, createFakeSupabase({ savings_goals: [goal('g1', 'Flight training'), goal('g2', 'Travel')] }))
    await said('ready: Flight training · Flight training, Travel · ordered')
  })

  it('has no main goal when none is active', async () => {
    renderScreen(<Goals />, createFakeSupabase({ savings_goals: [goal('g1', 'House', { status: 'paused' })] }))
    await said('ready: no main goal · House · ordered')
  })

  // Fail soft: 0015's columns are not there yet (42703), so the goals are read
  // as before it, every one active at place 0, and the first load goes on.
  it('reads the goals as before when 0015 is not in yet, the oldest leading, and says so', async () => {
    const fake = createFakeSupabase({ savings_goals: [goal('g1', 'Flight training'), goal('g2', 'Travel')] })
    fake.server.lacks = { savings_goals: ['sort_order', 'status', 'reached_on'] }
    renderScreen(<Goals />, fake)
    await said('ready: Flight training · Flight training, Travel · needs 0015')
  })

  it('still fails the first load on any other refusal of the goals', async () => {
    const fake = createFakeSupabase({ savings_goals: [goal('g1', 'Flight training')] })
    fake.fail('savings_goals', 'PGRST301')
    renderScreen(<Goals />, fake)
    await said('failed: no main goal ·  · ordered')
  })
})
