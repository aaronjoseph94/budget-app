import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { projectGoal } from '../src/goal.js'
import { goalForecast } from '../src/goal-forecast.js'

/**
 * Hand-derived (F33 has no workbook cell): a pace so slow that its date is
 * past year 9999, the last a date here can write, has no date. It is never
 * a throw, which would take every other goal's date with it.
 *
 * A large goal on a fund whose slow month was nearly nothing. Four complete
 * months, June to September 2026: $1.00, $500.00, $500.00, $500.00 moved in
 * (money into savings is a negative row, D3).
 *
 *   middle pace: median 500.00 a month -> 500.00 x 12 / 52 = 115.38 a week
 *   high pace:   75th percentile = rank ceil(0.75 x 4) = 3 -> 500.00 too
 *   low pace:    25th percentile = rank ceil(0.25 x 4) = 1 -> 1.00 a month
 *                -> 1.00 x 12 / 52 = 0.23 a week
 *   remaining:   120,000.00 - 5,000.00 = 115,000.00
 *   middle date: ceil(11,500,000 / 11,538) = 997 weeks = 6,979 days: 19
 *                years (6,940 days, five of them leap days) and 39 days
 *                after 2026-10-15, which is 2045-11-23.
 *   late date:   ceil(11,500,000 / 23) = 500,000 weeks, about 9,582 years
 *                after 2026-10-15: past year 9999, so there is none.
 */
const fund = { id: 'house', name: 'House deposit', kind: 'savings' as const, sortOrder: 0 }
const moved = (month: string, cents: number) => ({ postedOn: isoDate(`${month}-10`), amountCents: -cents, categoryId: fund.id })

const input = {
  asOf: isoDate('2026-10-15'),
  historyStart: isoDate('2026-06-01'),
  readFrom: isoDate('2025-10-01'),
  categories: [fund],
  entries: [moved('2026-06', 100), moved('2026-07', 50_000), moved('2026-08', 50_000), moved('2026-09', 50_000)],
  goal: { targetCents: 12_000_000, savedCents: 500_000, targetDate: null, fundCategoryId: fund.id },
}

describe('goalForecast when the slow pace would take past year 9999', () => {
  it('still gives the forecast: the early and middle dates, and no late date', () => {
    const forecast = goalForecast(input)
    expect(forecast.pace).toMatchObject({
      status: 'range',
      weekly: { low: 23, middle: 11_538, high: 11_538 },
      dates: { early: '2045-11-23', middle: '2045-11-23', late: null },
    })
    expect(forecast.paceWeeklyCents).toBe(11_538)
  })

  it('the same input with the slow month at $100.00 has a late date', () => {
    // 100.00 x 12 / 52 = 23.08 a week: ceil(11,500,000 / 2,308) = 4,983 weeks, 2122-04-16.
    const entries = [moved('2026-06', 10_000), ...input.entries.slice(1)]
    const forecast = goalForecast({ ...input, entries })
    expect(forecast.pace).toMatchObject({ status: 'range', dates: { early: '2045-11-23', middle: '2045-11-23', late: '2122-04-16' } })
    expect(forecast.paceWeeklyCents).toBe(11_538)
  })
})

describe('goalForecast when the middle pace itself would take past year 9999', () => {
  // Five cents of interest a month: 5 x 12 / 52 = 1.15, a cent a week.
  // $10,000.00 to go is 1,000,000 weeks, about 19,165 years.
  const interest = ['2026-06', '2026-07', '2026-08', '2026-09'].map((m) => moved(m, 5))
  const goal = { ...input.goal, targetCents: 1_000_000, savedCents: 0 }

  it('has no date, says the pace is too slow rather than nothing, and sets no lever against it', () => {
    const forecast = goalForecast({ ...input, entries: interest, goal })
    expect(forecast.pace).toEqual({ status: 'no_pace', months: 4, evidence: 'some', tooSlow: true })
    expect(forecast.paceWeeklyCents).toBeNull()
  })

  it('is the same with one or two complete months, where the date would be rough', () => {
    const forecast = goalForecast({ ...input, historyStart: isoDate('2026-08-01'), entries: interest, goal })
    expect(forecast.pace).toEqual({ status: 'no_pace', months: 2, evidence: 'thin', tooSlow: true })
  })

  it('a pace that saves nothing is not called too slow', () => {
    const forecast = goalForecast({ ...input, entries: [], goal })
    expect(forecast.pace).toEqual({ status: 'no_pace', months: 4, evidence: 'some', tooSlow: false })
  })
})

describe('projectGoal at the end of the calendar', () => {
  const goal = { name: 'goal', targetCents: 300, savedCents: 0 }

  it('gives 9999-12-31 itself: three weeks, 21 days, from 9999-12-10', () => {
    expect(projectGoal({ goal, weeklyContributionCents: 100, asOf: isoDate('9999-12-10') })).toEqual({ weeksRemaining: 3, projectedDate: '9999-12-31' })
  })

  it('gives the weeks and no date a day later, where the date would be in year 10000', () => {
    expect(projectGoal({ goal, weeklyContributionCents: 100, asOf: isoDate('9999-12-11') })).toEqual({ weeksRemaining: 3, projectedDate: null })
  })

  it('gives no date for weeks too many to multiply by seven exactly', () => {
    const huge = { name: 'goal', targetCents: Number.MAX_SAFE_INTEGER, savedCents: 0 }
    expect(projectGoal({ goal: huge, weeklyContributionCents: 1, asOf: isoDate('2026-10-15') })).toEqual({ weeksRemaining: Number.MAX_SAFE_INTEGER, projectedDate: null })
  })
})
