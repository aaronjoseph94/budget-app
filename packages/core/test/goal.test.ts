import { describe, it, expect } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import {
  goalProgress,
  projectGoal,
  requiredWeeklyContribution,
  timeEquivalent,
  type SavingsGoal,
} from '../src/goal.js'

/** $30,000 for flying lessons at $275/hr dual instruction. */
const FLYING: SavingsGoal = {
  name: 'Flying lessons',
  targetCents: 3_000_000,
  savedCents: 0,
  unitCostCents: 27_500,
  unitLabel: 'hours',
}

describe('goalProgress', () => {
  it('converts the target into goal units', () => {
    // 3_000_000 / 27_500 = 109.09 -> 109 whole hours
    expect(goalProgress(FLYING).unitsRemaining).toBe(109)
  })

  it('reports progress in basis points, never a float', () => {
    const p = goalProgress({ ...FLYING, savedCents: 750_000 })
    expect(p.percentCompleteBasisPoints).toBe(2500) // exactly 25.00%
    expect(p.remainingCents).toBe(2_250_000)
    expect(p.unitsEarned).toBe(27) // 750_000 / 27_500 = 27.27 -> 27 hours banked
  })

  it('never exceeds 100% or reports negative remaining when over-saved', () => {
    const p = goalProgress({ ...FLYING, savedCents: 3_500_000 })
    expect(p.percentCompleteBasisPoints).toBe(10_000)
    expect(p.remainingCents).toBe(0)
  })

  it('reads a fund taken under zero as 0%, as fundProgress does, and banks no units', () => {
    // $1,000 typed in, $1,250 moved back out: the fund stands at -$250.00.
    const p = goalProgress({ ...FLYING, targetCents: 400_000, savedCents: -25_000 })
    expect(p.percentCompleteBasisPoints).toBe(0)
    expect(Object.is(p.percentCompleteBasisPoints, -0)).toBe(false)
    expect(p.unitsEarned).toBe(0)
    expect(Object.is(goalProgress({ ...FLYING, targetCents: 20_000, savedCents: -1 }).percentCompleteBasisPoints, 0)).toBe(true)
  })

  it('rounds a share half-up to a basis point', () => {
    // 1/3 = 3,333.33 bp -> 3,333; 1/20,000 = 0.5 bp -> 1.
    expect(goalProgress({ name: 'x', targetCents: 3, savedCents: 1 }).percentCompleteBasisPoints).toBe(3333)
    expect(goalProgress({ name: 'x', targetCents: 20_000, savedCents: 1 }).percentCompleteBasisPoints).toBe(1)
  })

  it('rejects a non-positive target rather than dividing by zero', () => {
    expect(() => goalProgress({ ...FLYING, targetCents: 0 })).toThrow(RangeError)
  })
})

describe('projectGoal', () => {
  const asOf = isoDate('2026-09-21')

  it.each([
    [10_000, 300], // $100/wk -> 300 weeks
    [20_000, 150], // $200/wk -> 150 weeks
    [30_000, 100], // $300/wk -> 100 weeks
    [50_000, 60], //  $500/wk ->  60 weeks
  ])('at %i cents per week the goal lands in %i weeks', (weekly, expected) => {
    expect(projectGoal(FLYING, weekly, asOf).weeksRemaining).toBe(expected)
  })

  it('projects a real date', () => {
    // 100 weeks = 700 days from 2026-09-21
    expect(projectGoal(FLYING, 30_000, asOf).projectedDate).toBe('2028-08-21')
  })

  it('rounds partial weeks up — you do not arrive mid-contribution', () => {
    expect(projectGoal({ ...FLYING, targetCents: 10_001 }, 10_000, asOf).weeksRemaining).toBe(2)
  })

  it('answers "never" honestly when nothing is being saved', () => {
    const p = projectGoal(FLYING, 0, asOf)
    expect(p.weeksRemaining).toBeNull()
    expect(p.projectedDate).toBeNull()
  })
})

describe('requiredWeeklyContribution', () => {
  it('computes the weekly number a deadline demands', () => {
    // 2026-09-21 -> 2028-09-21 is 731 days, not 730: 2028 is a leap year and
    // Feb 29 falls inside the window. 731 / 7 = 104.43 weeks;
    // 3_000_000 / 104.43 = 28_727.8 -> 28_728 ($287.28/week).
    const weekly = requiredWeeklyContribution(
      FLYING,
      isoDate('2026-09-21'),
      isoDate('2028-09-21'),
    )
    expect(weekly).toBe(28_728)
  })

  it('refuses a target date in the past instead of returning a nonsense number', () => {
    expect(() =>
      requiredWeeklyContribution(FLYING, isoDate('2026-09-21'), isoDate('2026-09-01')),
    ).toThrow(RangeError)
  })
})

describe('timeEquivalent — the tradeoff framing', () => {
  it('prices an $80 dinner in flight time at $275/hr', () => {
    expect(timeEquivalent(8_000, 27_500)).toEqual({ totalMinutes: 17, hours: 0, minutes: 17 })
  })

  it('prices a week of restaurant spend', () => {
    // $412 at $275/hr = 1.498 hours = 90 minutes
    expect(timeEquivalent(41_200, 27_500)).toEqual({ totalMinutes: 90, hours: 1, minutes: 30 })
  })

  it('rejects a zero rate rather than dividing by zero', () => {
    expect(() => timeEquivalent(8_000, 0)).toThrow(RangeError)
  })
})
