import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { savingsFundPlan } from '../src/savings.js'

/**
 * Suite, not External: savingsFundPlan worked by hand from invented funds,
 * for the cases the sample's two funds do not reach (F21, D22). The cached
 * cells are in the workbook-savings golden.
 */
const plan = (goal: number, current: number, start: string | null, end: string | null) =>
  savingsFundPlan({
    goalCents: goal,
    currentCents: current,
    startDate: start === null ? null : isoDate(start),
    goalDate: end === null ? null : isoDate(end),
  })

describe('savingsFundPlan', () => {
  it('divides what is needed by whole months from the start date', () => {
    // $1,200 needed over 2026-01-15 → 2027-01-15, 12 months: $100.00 exactly.
    expect(plan(150_000, 30_000, '2026-01-15', '2027-01-15')).toEqual({
      amountNeededCents: 120_000,
      monthsRemaining: 12,
      monthlyContributionCents: 10_000,
      status: 'planned',
    })
  })

  it('rounds a fraction of a cent up, never down (F9)', () => {
    // 100000 / 3 = 33333.33…: 33334, so three payments reach the goal.
    expect(plan(100_000, 0, '2026-01-01', '2026-04-01').monthlyContributionCents).toBe(33_334)
    // 100001 / 3 = 33333.67…: 33334, not 33333.
    expect(plan(100_001, 0, '2026-01-01', '2026-04-01').monthlyContributionCents).toBe(33_334)
  })

  it('counts a goal date a day short of the month as one month fewer', () => {
    const p = plan(120_000, 0, '2026-01-15', '2026-04-14')
    expect(p.monthsRemaining).toBe(2)
    expect(p.monthlyContributionCents).toBe(60_000)
  })

  it('keeps the minus sign once the goal is passed, as Savings!B9 has no floor', () => {
    const p = plan(100_000, 100_500, '2026-01-01', '2026-03-01')
    expect(p.amountNeededCents).toBe(-500)
    // −250 a month exactly; a remainder rounds towards zero.
    expect(p.monthlyContributionCents).toBe(-250)
    expect(plan(100_000, 100_500, '2026-01-01', '2026-04-01').monthlyContributionCents).toBe(-166)
  })

  it('needs nothing a month once the goal is met exactly', () => {
    const p = plan(100_000, 100_000, '2026-01-01', '2026-04-01')
    expect(p.amountNeededCents).toBe(0)
    expect(p.monthlyContributionCents).toBe(0)
    expect(Object.is(p.monthlyContributionCents, -0)).toBe(false)
  })

  it('has no months and no contribution with either date missing (D15)', () => {
    for (const p of [plan(100_000, 0, null, '2027-01-01'), plan(100_000, 0, '2026-01-01', null), plan(100_000, 0, null, null)]) {
      expect(p).toEqual({ amountNeededCents: 100_000, monthsRemaining: null, monthlyContributionCents: null, status: 'no-dates' })
    }
  })

  it('has no contribution when the goal date is before the start (D22, V14 #NUM!)', () => {
    expect(plan(100_000, 0, '2026-05-01', '2026-04-30')).toEqual({
      amountNeededCents: 100_000,
      monthsRemaining: null,
      monthlyContributionCents: null,
      status: 'goal-before-start',
    })
  })

  it('shows 0 months and no contribution inside one month (D22, V14 0)', () => {
    for (const p of [plan(100_000, 0, '2026-05-01', '2026-05-31'), plan(100_000, 0, '2026-05-10', '2026-06-09'), plan(100_000, 0, '2026-05-10', '2026-05-10')]) {
      expect(p).toEqual({ amountNeededCents: 100_000, monthsRemaining: 0, monthlyContributionCents: null, status: 'under-a-month' })
    }
  })

  it('refuses a fraction of a cent', () => {
    expect(() => plan(100.5, 0, null, null)).toThrow(RangeError)
    expect(() => plan(100, 0.5, null, null)).toThrow(RangeError)
  })
})
