import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { goalForecast, type GoalForecastInput } from '../src/index.js'

/** Suite tests, worked by hand from F33 (docs/formula-decisions.md). */

const d = isoDate
const FUND = 'c-flight-fund'
const DINING = 'c-dining'
/** Money moved into a fund is a negative ledger row, as on the Month (D3). */
const moveIn = (postedOn: string, dollars: number, categoryId = FUND) => ({ postedOn: d(postedOn), amountCents: -dollars * 100, categoryId })

/**
 * F33's worked example: Thursday 24 September 2026, records from 1 May,
 * Flight training $12,650.00 of $30,000.00, and May to August moved in.
 */
const base: GoalForecastInput = {
  asOf: d('2026-09-24'),
  historyStart: d('2026-05-01'),
  readFrom: d('2025-09-01'),
  categories: [
    { id: FUND, name: 'Flight fund', kind: 'savings', sortOrder: 0 },
    { id: DINING, name: 'Dining out', kind: 'variable', sortOrder: 0 },
  ],
  entries: [
    moveIn('2026-05-15', 400),
    moveIn('2026-06-01', 400),
    moveIn('2026-06-15', 250),
    moveIn('2026-07-15', 500),
    moveIn('2026-08-15', 300),
    // Spending elsewhere and this month's moves are no part of the pace.
    { postedOn: d('2026-08-20'), amountCents: -9_000, categoryId: DINING },
    moveIn('2026-09-15', 300),
  ],
  goal: { targetCents: 3_000_000, savedCents: 1_265_000, targetDate: null, fundCategoryId: FUND },
}

describe('goalForecast (F33)', () => {
  it('gives a date at the low, middle and high pace of up to six complete months', () => {
    // Sorted 300, 400, 500, 650: low rank 1, middle (400 + 500) ÷ 2, high
    // rank 3. Weekly 69.23, 103.85, 115.38; 251, 168 and 151 weeks.
    expect(goalForecast(base)).toEqual({
      remainingCents: 1_735_000,
      neededWeeklyCents: null,
      paceWeeklyCents: 10_385,
      pace: {
        status: 'range',
        months: 4,
        evidence: 'some',
        weekly: { low: 6_923, middle: 10_385, high: 11_538 },
        dates: { early: '2029-08-16', middle: '2029-12-13', late: '2031-07-17' },
      },
    })
  })

  it('gives one rough date from the middle pace under three complete months', () => {
    // July and August: ($500.00 + $300.00) ÷ 2 = $400.00, $92.31 a week, 188 weeks.
    const forecast = goalForecast({ ...base, historyStart: d('2026-07-01') })
    expect(forecast.pace).toEqual({ status: 'rough', months: 2, evidence: 'thin', weeklyCents: 9_231, date: '2030-05-02' })
    expect(forecast.paceWeeklyCents).toBe(9_231)
  })

  it('counts a month before what was read as missing, not as nothing moved in', () => {
    expect(goalForecast({ ...base, readFrom: d('2026-07-01') }).pace).toMatchObject({ status: 'rough', months: 2 })
  })

  it('uses only the six most recent complete months', () => {
    // $1,000.00 in each of November to April. The six most recent months are
    // March to August: sorted 300, 400, 500, 650, 1,000, 1,000, so the middle
    // is (500 + 650) ÷ 2 = $575.00, $132.69 a week. All ten would give $1,000.00.
    const older = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'].map((m) => moveIn(`${m}-10`, 1_000))
    const forecast = goalForecast({ ...base, historyStart: d('2025-11-01'), entries: [...base.entries, ...older] })
    expect(forecast.pace).toMatchObject({ status: 'range', months: 6, evidence: 'solid' })
    expect(forecast.paceWeeklyCents).toBe(13_269)
  })

  it('counts money taken back out, and has no late date when the low pace saves nothing', () => {
    // July's $500.00 in and $600.00 out is -$100.00. Sorted -100, 300, 400, 650:
    // the low, rank 1, saves nothing; the middle is $350.00, $80.77 a week.
    const forecast = goalForecast({ ...base, entries: [...base.entries, { postedOn: d('2026-07-20'), amountCents: 60_000, categoryId: FUND }] })
    expect(forecast.pace).toMatchObject({ status: 'range', weekly: { low: -2_308, middle: 8_077, high: 9_231 } })
    expect(forecast.pace.status === 'range' ? forecast.pace.dates.late : 'not a range').toBeNull()
  })

  it('has no date when the middle pace saves nothing', () => {
    const forecast = goalForecast({ ...base, entries: [moveIn('2026-09-15', 300)] })
    expect(forecast.pace).toEqual({ status: 'no_pace', months: 4, evidence: 'some' })
    expect(forecast.paceWeeklyCents).toBeNull()
  })

  it('says when a pace becomes possible when no month is complete yet', () => {
    // Records from 8 August: September is the first whole month, complete on 1 October.
    expect(goalForecast({ ...base, historyStart: d('2026-08-08') }).pace).toEqual({ status: 'too_early', possibleFrom: '2026-10-01' })
    // Records from the 1st make that month whole: August, complete on 1 September.
    expect(goalForecast({ ...base, asOf: d('2026-08-31'), historyStart: d('2026-08-01') }).pace).toEqual({
      status: 'too_early',
      possibleFrom: '2026-09-01',
    })
    expect(goalForecast({ ...base, historyStart: null }).pace).toEqual({ status: 'too_early', possibleFrom: null })
  })

  it('measures nothing for a goal on no fund, or on a fund moved off the Savings list', () => {
    expect(goalForecast({ ...base, goal: { ...base.goal, fundCategoryId: null } }).pace).toEqual({ status: 'no_fund' })
    expect(goalForecast({ ...base, goal: { ...base.goal, fundCategoryId: DINING } }).pace).toEqual({ status: 'no_fund' })
  })

  it('says the target is met, with nothing left and nothing to forecast', () => {
    expect(goalForecast({ ...base, goal: { ...base.goal, savedCents: 3_000_000 } })).toEqual({
      remainingCents: 0,
      neededWeeklyCents: null,
      paceWeeklyCents: null,
      pace: { status: 'met' },
    })
  })

  it('gives the weekly amount that lands a target date still ahead, and none for one passed', () => {
    // $17,350.00 over 731 ÷ 7 weeks, rounded up: $166.15.
    expect(goalForecast({ ...base, goal: { ...base.goal, targetDate: d('2028-09-24') } }).neededWeeklyCents).toBe(16_615)
    expect(goalForecast({ ...base, goal: { ...base.goal, targetDate: d('2026-09-24') } }).neededWeeklyCents).toBeNull()
  })
})
