import { describe, expect, it } from 'vitest'
import { cents, isoDate } from '@budget/money-primitives'
import { dailyIndex, impactScore } from '../src/index.js'

/** Suite tests, worked by hand from F44 (docs/formula-decisions.md). */

describe('impactScore (F44)', () => {
  it('scales a change to a whole month, half-up, then weighs it by its evidence', () => {
    // F44's worked example: $212.40 × 30 ÷ 24 = $265.50, solid (× 3) = 79,650.
    expect(impactScore({ effect: 'change', changeCents: cents(21_240), days: 24, daysInMonth: 30, evidence: 'solid' })).toEqual({
      effectCents: 26_550, impact: 79_650,
    })
    // A fall counts by its size: 1 × 30 ÷ 12 = 2.5 → 3, thin (× 1).
    expect(impactScore({ effect: 'change', changeCents: cents(-1), days: 12, daysInMonth: 30, evidence: 'thin' })).toEqual({
      effectCents: 3, impact: 3,
    })
  })

  it('takes a monthly figure as it is, weighed thin 1, some 2, solid 3', () => {
    expect(impactScore({ effect: 'monthly', monthlyCents: cents(3_000), evidence: 'solid' })).toEqual({ effectCents: 3_000, impact: 9_000 })
    expect(impactScore({ effect: 'monthly', monthlyCents: cents(3_000), evidence: 'some' })).toEqual({ effectCents: 3_000, impact: 6_000 })
    expect(impactScore({ effect: 'monthly', monthlyCents: cents(-3_000), evidence: 'thin' })).toEqual({ effectCents: 3_000, impact: 3_000 })
  })

  it('refuses a window that is not inside its month', () => {
    expect(() => impactScore({ effect: 'change', changeCents: cents(100), days: 0, daysInMonth: 30, evidence: 'thin' })).toThrow(RangeError)
  })
})

describe('dailyIndex (F44)', () => {
  it('is the days since 1 January 1970, modulo the count, so each day moves one on', () => {
    // 24 Sep 2026 is day 20,720: 20,720 mod 17 = 14, and the next day 15.
    expect(dailyIndex({ asOf: isoDate('2026-09-24'), count: 17 })).toEqual({ index: 14 })
    expect(dailyIndex({ asOf: isoDate('2026-09-25'), count: 17 })).toEqual({ index: 15 })
    expect(dailyIndex({ asOf: isoDate('1970-01-01'), count: 5 })).toEqual({ index: 0 })
  })

  it('stays inside the list before 1970', () => {
    expect(dailyIndex({ asOf: isoDate('1969-12-31'), count: 17 })).toEqual({ index: 16 })
  })

  it('refuses a count below 1', () => {
    expect(() => dailyIndex({ asOf: isoDate('2026-09-24'), count: 0 })).toThrow(RangeError)
  })
})
