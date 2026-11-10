import { describe, expect, it } from 'vitest'
import { addDays, isoDate } from '@budget/money-primitives'
import { requiredWeeklyContribution } from '../src/goal.js'

/**
 * Hand-derived (not workbook-derived; N74): the weekly amount a target date
 * needs is remaining x 7 / days, rounded up to the whole cent, worked in
 * integers, so a figure that is exactly a whole number of cents is never
 * rounded up a cent past it.
 *
 * $9,999.99 to go, 143 days ahead: 999,999 x 7 / 143 = 48,951 exactly
 * (143 x 48,951 = 6,999,993), so $489.51 a week.
 */
const asOf = isoDate('2026-01-01')
const exact = (remaining: number, days: number) => Number((BigInt(remaining) * 7n + BigInt(days) - 1n) / BigInt(days))
const engine = (remaining: number, days: number) =>
  requiredWeeklyContribution({ goal: { name: 'goal', targetCents: remaining, savedCents: 0 }, asOf, targetDate: addDays(asOf, days) }).weeklyCents

describe('requiredWeeklyContribution rounds up to the whole cent, in integers (N74)', () => {
  it('$9,999.99 over 143 days is $489.51 a week, exactly', () => {
    expect(exact(999_999, 143)).toBe(48_951)
    expect(engine(999_999, 143)).toBe(48_951)
  })

  it('still rounds a part of a cent up: $10,000.00 over 143 days is $489.52 a week', () => {
    // 1,000,000 x 7 / 143 = 48,951.04..., up to 48,952.
    expect(engine(1_000_000, 143)).toBe(48_952)
  })

  it('agrees with integer arithmetic for every whole-dollar amount to $3,000 over every span to two years', () => {
    const differs: string[] = []
    for (let dollars = 1; dollars <= 3_000; dollars++) {
      for (let days = 1; days <= 730; days++) {
        if (engine(dollars * 100, days) !== exact(dollars * 100, days)) differs.push(`${dollars}.00 over ${days} days`)
      }
    }
    expect(differs).toEqual([])
  }, 60_000)
})
