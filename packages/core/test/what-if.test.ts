import { describe, expect, it } from 'vitest'
import { cents as c, isoDate } from '@budget/money-primitives'
import { whatIf, type WhatIfInput } from '../src/index.js'

/** Suite tests, worked by hand from F35's what-if (docs/formula-decisions.md). */

const d = isoDate

/**
 * Dining out's quarter, $100.00 a month (F34), on 24 September 2026: F30's
 * month ends $3,280 to $3,340, and Flight training has $17,350.00 to go at
 * $69.23, $103.85 and $115.38 a week (F33), at $275.00 an hour.
 */
const base: WhatIfInput = {
  asOf: d('2026-09-24'),
  monthlyCents: 10_000,
  end: { low: 328_000, mid: 331_000, high: 334_000 },
  goal: {
    remainingCents: 1_735_000,
    unitCostCents: 27_500,
    pace: { status: 'range', months: 4, evidence: 'some', weekly: { low: c(6_923), middle: c(10_385), high: c(11_538) }, dates: { early: d('2029-08-16'), middle: d('2029-12-13'), late: d('2031-07-17') } },
  },
}

describe('whatIf (F35)', () => {
  it('moves the month’s end by what the lever keeps of the days left, and the goal’s dates by its week', () => {
    // Kept: 100.00 × 6 ÷ 30 = 20.00. Weekly 23.08: ⌈17,350.00 ÷ 138.46⌉ = 126,
    // ⌈÷ 126.93⌉ = 137 and ⌈÷ 92.31⌉ = 188 weeks; 168 − 137 = 31 sooner.
    expect(whatIf(base)).toEqual({
      weeklyCents: 2_308,
      keptThisMonthCents: 2_000,
      end: { low: 330_000, mid: 333_000, high: 336_000 },
      goal: { status: 'sooner', rough: false, dates: { early: '2029-02-22', middle: '2029-05-10', late: '2030-05-02' }, weeksSooner: 31 },
      minutesPerMonth: 22,
    })
  })

  it('keeps a rough date rough: one date from the middle pace', () => {
    // 92.31 + 23.08 = 115.39 a week: ⌈17,350.00 ÷ 115.39⌉ = 151 weeks, 188 − 151 = 37 sooner.
    const rough = whatIf({ ...base, goal: { ...base.goal, pace: { status: 'rough', months: 1, evidence: 'thin', weeklyCents: c(9_231), date: d('2030-05-02') } } })
    expect(rough.goal).toEqual({ status: 'sooner', rough: true, dates: { early: '2029-08-16', middle: '2029-08-16', late: '2029-08-16' }, weeksSooner: 37 })
  })

  it('leaves no late date when the low pace and the lever still save nothing', () => {
    const range = base.goal.pace as Extract<WhatIfInput['goal']['pace'], { status: 'range' }>
    const slow = whatIf({ ...base, goal: { ...base.goal, pace: { ...range, weekly: { ...range.weekly, low: c(-3_000) } } } })
    expect(slow.goal).toMatchObject({ status: 'sooner', dates: { late: null } })
  })

  it('with no pace, says how long the lever alone takes; with no start, moves no end', () => {
    // ⌈17,350.00 ÷ 23.08⌉ = 752 weeks from 24 September 2026.
    const alone = whatIf({ ...base, end: null, goal: { ...base.goal, pace: { status: 'no_fund' } } })
    expect(alone).toMatchObject({ keptThisMonthCents: 2_000, end: null, goal: { status: 'alone', weeks: 752, date: '2041-02-21' } })
  })

  it('has no date to move for a goal already met, and no time a month for a goal in dollars', () => {
    expect(whatIf({ ...base, goal: { remainingCents: 0, unitCostCents: null, pace: { status: 'met' } } })).toMatchObject({ goal: { status: 'met' }, minutesPerMonth: null })
  })

  it('rounds what is kept half-up, and keeps nothing on the month’s last day', () => {
    // 25 September: 100.00 × 5 ÷ 30 = 16.666…, 16.67; 3,310.00 + 16.67 is $3,330.
    expect(whatIf({ ...base, asOf: d('2026-09-25') })).toMatchObject({ keptThisMonthCents: 1_667, end: { mid: 333_000 } })
    expect(whatIf({ ...base, asOf: d('2026-09-30') })).toMatchObject({ keptThisMonthCents: 0, end: base.end })
  })
})
