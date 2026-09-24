import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { fundBalance, fundProgress, savingsFunds, type FundGoal } from '../src/savings.js'

/**
 * Suite, not External: the workbook types every balance and reads no transfer
 * (Savings!B5), so D16's kept balance has no cached value to replay. Worked
 * by hand from invented rows; money into savings is a negative ledger row (D3).
 */
const d = isoDate
const row = (postedOn: string, amountCents: number, categoryId = 'fund-a') => ({ postedOn: d(postedOn), amountCents, categoryId })

describe('fundBalance (D16)', () => {
  const entries = [row('2026-09-10', -5_000), row('2026-09-11', -2_500), row('2026-09-20', 1_000), row('2026-09-30', -9_999)]

  it('adds what moved in after the typed day, and takes off what came back out', () => {
    // 100.00 typed at the end of Sep 10; +25.00 on the 11th; −10.00 on the 20th.
    expect(fundBalance({ typedCents: 10_000, typedOn: d('2026-09-10'), asOf: d('2026-09-23'), entries })).toEqual({
      balanceCents: 11_500,
      transfersCents: 1_500,
    })
  })

  it('counts a row on the typed day as already typed, and none after asOf', () => {
    const b = fundBalance({ typedCents: 10_000, typedOn: d('2026-09-10'), asOf: d('2026-09-11'), entries })
    expect(b.balanceCents).toBe(12_500)
  })

  it('is the typed amount with no transfers since, and not -0', () => {
    const b = fundBalance({ typedCents: 10_000, typedOn: d('2026-09-30'), asOf: d('2026-10-01'), entries })
    expect(b).toEqual({ balanceCents: 10_000, transfersCents: 0 })
    expect(Object.is(b.transfersCents, -0)).toBe(false)
  })
})

describe('fundProgress', () => {
  it('is the balance over the goal, half-up to a basis point', () => {
    // 133 / 2000 = 6.65% exactly; 1 / 3 = 33.333…% → 3333.
    expect(fundProgress({ goalCents: 200_000, balanceCents: 13_300 })).toEqual({ progressBp: 665, reached: false })
    expect(fundProgress({ goalCents: 300, balanceCents: 100 }).progressBp).toBe(3_333)
  })

  it('draws nothing at or below zero, and the whole bar at or past the goal', () => {
    expect(fundProgress({ goalCents: 1_000, balanceCents: 0 })).toEqual({ progressBp: 0, reached: false })
    expect(fundProgress({ goalCents: 1_000, balanceCents: -50 })).toEqual({ progressBp: 0, reached: false })
    expect(fundProgress({ goalCents: 1_000, balanceCents: 1_000 })).toEqual({ progressBp: 10_000, reached: true })
    expect(fundProgress({ goalCents: 1_000, balanceCents: 5_000 })).toEqual({ progressBp: 10_000, reached: true })
  })

  it('refuses a goal of zero, which 0004 does too', () => {
    expect(() => fundProgress({ goalCents: 0, balanceCents: 0 })).toThrow(RangeError)
  })
})

describe('savingsFunds', () => {
  const categories = [
    { id: 'fund-b', name: 'Travel', kind: 'savings', sortOrder: 2 },
    { id: 'fund-a', name: 'Flight training', kind: 'savings', sortOrder: 1 },
    { id: 'moved', name: 'Old fund', kind: 'variable', sortOrder: 0 },
  ]
  const goal = (over: Partial<FundGoal>): FundGoal => ({
    id: 'g-a',
    categoryId: 'fund-a',
    goalCents: 100_000,
    typedCents: 20_000,
    typedOn: d('2026-09-01'),
    startDate: d('2026-09-01'),
    goalDate: d('2027-09-01'),
    ...over,
  })

  it("gives one card per Savings-list category in the list's order, each with its goal's figures", () => {
    const out = savingsFunds({
      asOf: d('2026-09-23'),
      categories,
      goals: [goal({})],
      entries: [row('2026-09-15', -4_000), row('2026-09-15', -7_000, 'fund-b'), row('2026-09-16', -1_000, 'moved')],
    })
    expect(out.funds.map((f) => f.name)).toEqual(['Flight training', 'Travel'])
    const a = out.funds[0]!.figures!
    // 200.00 typed + 40.00 moved in = 240.00 of 1,000.00; 760.00 over 12 months.
    expect(a).toMatchObject({ goalId: 'g-a', goalCents: 100_000, balanceCents: 24_000, transfersCents: 4_000, progressBp: 2_400, reached: false })
    expect(a.plan).toEqual({ amountNeededCents: 76_000, monthsRemaining: 12, monthlyContributionCents: 6_334, status: 'planned' })
    expect(out.funds[1]!.figures).toBeNull()
    expect(out.unlinked).toEqual([])
  })

  it('reads no transfer for a goal on no fund, or on a category moved off Savings (N52)', () => {
    const out = savingsFunds({
      asOf: d('2026-09-23'),
      categories,
      goals: [goal({ id: 'g-none', categoryId: null, typedOn: null }), goal({ id: 'g-moved', categoryId: 'moved' })],
      entries: [row('2026-09-16', -1_000, 'moved')],
    })
    expect(out.funds.every((f) => f.figures === null)).toBe(true)
    expect(out.unlinked.map((u) => [u.goalId, u.progressBp, u.plan.amountNeededCents])).toEqual([
      ['g-none', 2_000, 80_000],
      ['g-moved', 2_000, 80_000],
    ])
    // Drawn as a fund's card is (G1): the typed amount, and nothing moved in.
    expect(out.unlinked[1]).toMatchObject({ goalCents: 100_000, balanceCents: 20_000, transfersCents: 0, reached: false })
  })

  it('refuses a linked goal with no typed day, which 0013 does too', () => {
    expect(() =>
      savingsFunds({ asOf: d('2026-09-23'), categories, goals: [goal({ typedOn: null })], entries: [] }),
    ).toThrow(RangeError)
  })
})
