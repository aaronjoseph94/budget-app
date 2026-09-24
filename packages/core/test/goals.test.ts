/**
 * Savings goals, plural (F45). Hand-derived: nothing here comes from the
 * workbook, whose Savings tab has no order of goals and no main goal (D28).
 */
import { describe, expect, it } from 'vitest'
import { goalAtEnd, goalsProgress, moveGoal, orderGoals, type GoalStatus } from '../src/goals.js'

const goal = (id: string, sortOrder: number, createdAt: string, status: GoalStatus = 'active') => ({
  id,
  sortOrder,
  status,
  createdAt,
})

// F45's worked example: every goal at place 0, as before 0015.
const flight = goal('g-flight', 0, '2026-03-01T09:00:00+00:00')
const emergency = goal('g-emergency', 0, '2026-09-03T09:00:00+00:00')
const house = goal('g-house', 0, '2026-09-20T09:00:00+00:00', 'paused')

const ids = (goals: readonly { readonly id: string }[]) => goals.map((g) => g.id)

describe('orderGoals', () => {
  it('leads with the oldest when every goal shares a place, as the app did before 0015', () => {
    const ordered = orderGoals({ goals: [house, emergency, flight] })
    expect(ids(ordered.active)).toEqual(['g-flight', 'g-emergency'])
    expect(ids(ordered.paused)).toEqual(['g-house'])
    expect(ordered.reached).toEqual([])
    expect(ordered.main?.id).toBe('g-flight')
  })

  it('orders by place first, then by when each was made, then by id', () => {
    const ordered = orderGoals({
      goals: [
        goal('b', 1, '2026-01-01T00:00:00+00:00'),
        goal('a', 1, '2026-01-01T00:00:00+00:00'),
        goal('c', 0, '2026-09-01T00:00:00+00:00'),
        goal('d', 1, '2025-12-31T23:59:59.5+00:00'),
      ],
    })
    expect(ids(ordered.active)).toEqual(['c', 'd', 'a', 'b'])
    expect(ordered.main?.id).toBe('c')
  })

  it('never makes a paused or reached goal the main one, however early its place', () => {
    const ordered = orderGoals({
      goals: [goal('done', 0, '2026-01-01T00:00:00+00:00', 'reached'), goal('rest', 1, '2026-01-01T00:00:00+00:00', 'paused'), goal('next', 5, '2026-02-01T00:00:00+00:00')],
    })
    expect(ordered.main?.id).toBe('next')
    expect(ids(ordered.reached)).toEqual(['done'])
    expect(ids(ordered.paused)).toEqual(['rest'])
  })

  it('has no main goal when none is active, or none at all', () => {
    expect(orderGoals({ goals: [house] }).main).toBeNull()
    expect(orderGoals({ goals: [] })).toEqual({ active: [], paused: [], reached: [], main: null })
  })

  it('keeps what it was given on each goal', () => {
    const named = { ...flight, name: 'Flight training' }
    expect(orderGoals({ goals: [named] }).main).toBe(named)
  })
})

describe('moveGoal', () => {
  // F45: moving Emergency up numbers the active goals Emergency 0, Flight
  // training 1; Emergency keeps the 0 it has, and House, paused, is left alone.
  it('swaps a goal with the active one above it, writing only the places that change', () => {
    expect(moveGoal({ goals: [flight, emergency, house], id: 'g-emergency', to: 'up' })).toEqual({
      changes: [{ id: 'g-flight', sortOrder: 1 }],
    })
  })

  it('swaps a goal with the active one below it, stepping over paused and reached goals', () => {
    const goals = [goal('a', 0, '2026-01-01'), goal('p', 1, '2026-01-02', 'paused'), goal('b', 2, '2026-01-03'), goal('c', 3, '2026-01-04')]
    expect(moveGoal({ goals, id: 'a', to: 'down' })).toEqual({
      changes: [
        { id: 'b', sortOrder: 0 },
        { id: 'a', sortOrder: 1 },
        { id: 'c', sortOrder: 2 },
      ],
    })
  })

  it('makes a goal the main one by putting it first and numbering the rest after it', () => {
    const goals = [goal('a', 0, '2026-01-01'), goal('b', 1, '2026-01-02'), goal('c', 2, '2026-01-03')]
    expect(moveGoal({ goals, id: 'c', to: 'first' })).toEqual({
      changes: [
        { id: 'c', sortOrder: 0 },
        { id: 'a', sortOrder: 1 },
        { id: 'b', sortOrder: 2 },
      ],
    })
  })

  it('numbers goals that share a place when one is made main, so the choice shows', () => {
    expect(moveGoal({ goals: [flight, emergency], id: 'g-emergency', to: 'first' })).toEqual({
      changes: [{ id: 'g-flight', sortOrder: 1 }],
    })
  })

  it('changes nothing at either end, for the main goal made main, or for a goal not active', () => {
    const goals = [goal('a', 0, '2026-01-01'), goal('b', 1, '2026-01-02'), goal('p', 2, '2026-01-03', 'paused')]
    expect(moveGoal({ goals, id: 'a', to: 'up' }).changes).toEqual([])
    expect(moveGoal({ goals, id: 'b', to: 'down' }).changes).toEqual([])
    expect(moveGoal({ goals, id: 'a', to: 'first' }).changes).toEqual([])
    expect(moveGoal({ goals, id: 'p', to: 'first' }).changes).toEqual([])
    expect(moveGoal({ goals, id: 'p', to: 'up' }).changes).toEqual([])
    expect(moveGoal({ goals, id: 'nowhere', to: 'down' }).changes).toEqual([])
  })
})

describe('goalAtEnd', () => {
  // F45: resuming House after Emergency was moved up puts it at max(0, 1, 0) + 1.
  it('places a new or resumed goal after every goal, paused and reached ones included', () => {
    const moved = [{ ...emergency, sortOrder: 0 }, { ...flight, sortOrder: 1 }, house]
    expect(goalAtEnd({ goals: moved })).toEqual({ sortOrder: 2 })
    expect(goalAtEnd({ goals: [goal('r', 7, '2026-01-01', 'reached'), goal('a', 2, '2026-01-02')] })).toEqual({ sortOrder: 8 })
  })

  it('starts the first goal at 0', () => {
    expect(goalAtEnd({ goals: [] })).toEqual({ sortOrder: 0 })
  })
})

describe('goalsProgress', () => {
  const amounts = (id: string, targetCents: number, savedCents: number, unitCostCents: number | null = null) => ({
    id,
    targetCents,
    savedCents,
    unitCostCents,
  })
  const one = (g: ReturnType<typeof amounts>) => goalsProgress({ goals: [g] }).goals[0]!

  // F45's worked example: 12,650.00 of 30,000.00 is 42.1666…%, 4,217 bp
  // half-up; 12,650.00 × 60 ÷ 275.00 = 2,760 min, 46 h; 30,000.00 × 60 ÷
  // 275.00 = 6,545.45… min, 6,545, 109 h.
  it('gives a goal with a cost per hour its bar, what is left and its hours', () => {
    expect(one(amounts('flight', 3_000_000, 1_265_000, 27_500))).toEqual({
      id: 'flight',
      savedCents: 1_265_000,
      targetCents: 3_000_000,
      remainingCents: 1_735_000,
      progressBp: 4217,
      targetMet: false,
      empty: false,
      hours: { saved: 46, target: 109 },
    })
  })

  it('gives a goal in dollars no hours', () => {
    expect(one(amounts('emergency', 100_000, 15_000))).toMatchObject({ progressBp: 1500, remainingCents: 85_000, hours: null })
  })

  it('gives every goal its own figures, in the order given', () => {
    const { goals } = goalsProgress({ goals: [amounts('b', 20_000, 5_000), amounts('a', 10_000, 10_000)] })
    expect(goals.map((g) => [g.id, g.progressBp, g.targetMet])).toEqual([
      ['b', 2500, false],
      ['a', 10_000, true],
    ])
  })

  it('fills the bar and leaves nothing to go at or past the target', () => {
    expect(one(amounts('car', 80_000, 85_000))).toMatchObject({ progressBp: 10_000, remainingCents: 0, targetMet: true, empty: false })
  })

  // Half-up to a basis point, as F17 rounds: 1 of 20,000 is 0.5 bp, 1 of 30,000 is 0.33 bp.
  it('rounds the bar half-up to a basis point', () => {
    expect(one(amounts('a', 20_000, 1)).progressBp).toBe(1)
    expect(one(amounts('b', 30_000, 1)).progressBp).toBe(0)
  })

  it('counts nothing saved as empty, with 0 h of the hours the target buys', () => {
    expect(one(amounts('flight', 3_000_000, 0, 27_500))).toMatchObject({ progressBp: 0, empty: true, hours: { saved: 0, target: 109 } })
  })

  // A fund with more taken out than put in (D16): -50.00 buys no hours, and
  // the whole target plus the 50.00 is still to go.
  it('draws no bar and no hours when less than nothing is saved', () => {
    expect(one(amounts('flight', 3_000_000, -5_000, 27_500))).toMatchObject({
      progressBp: 0,
      remainingCents: 3_005_000,
      empty: true,
      hours: null,
    })
  })

  it('refuses a target of zero, which no goal can have (0004)', () => {
    expect(() => goalsProgress({ goals: [amounts('zero', 0, 0)] })).toThrow(RangeError)
  })
})
