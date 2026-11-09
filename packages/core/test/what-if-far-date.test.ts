import { describe, expect, it } from 'vitest'
import { cents as c, isoDate } from '@budget/money-primitives'
import { whatIfLines, type AskGoal, type OutlookBase } from '../src/answer-outlook.js'
import { whatIf, type WhatIfInput } from '../src/index.js'

/**
 * Hand-derived (F35's what-if has no workbook cell): a saving that reaches a
 * goal only after year 9999, the last a date here can write, has its
 * weeks and no date. It is never a throw.
 *
 * $115,000.00 to go on 15 October 2026, on a goal with no pace.
 *   $1.00 a month   -> 1.00 x 12 / 52 = 0.23 a week: 11,500,000 / 23 =
 *                      500,000 weeks, about 9,582 years: no date.
 *   $100.00 a month -> 23.08 a week: ceil(11,500,000 / 2,308) = 4,983
 *                      weeks, 2122-04-16.
 */
const d = isoDate
const base: WhatIfInput = {
  asOf: d('2026-10-15'),
  monthlyCents: 100,
  end: null,
  goal: { remainingCents: 11_500_000, unitCostCents: null, pace: { status: 'no_fund' } },
}

describe('whatIf when the saving alone would take past year 9999', () => {
  it('gives the weeks it takes and no date', () => {
    expect(whatIf(base).goal).toEqual({ status: 'alone', weeks: 500_000, date: null })
  })

  it('the same goal with $100.00 a month has a date', () => {
    expect(whatIf({ ...base, monthlyCents: 10_000 }).goal).toEqual({ status: 'alone', weeks: 4_983, date: '2122-04-16' })
  })

  it('still refuses a saving of nothing a week on a goal with no pace', () => {
    // $0.02 a month x 12 / 52 is 0.46 of a cent: $0.00 a week.
    expect(() => whatIf({ ...base, monthlyCents: 2 })).toThrow(RangeError)
  })
})

describe('whatIf when the low pace with the saving still lands past year 9999', () => {
  it('has no late date, and moves the early and middle ones', () => {
    // Paces $0.00, $115.38 and $115.38 a week (997 weeks at the middle). With
    // 23 cents more: ceil(11,500,000 / 11,561) = 995 weeks, 2045-11-09, 2
    // weeks sooner; the low pace alone is the 500,000 weeks above.
    const pace = { status: 'range' as const, months: 4, evidence: 'some' as const, weekly: { low: c(0), middle: c(11_538), high: c(11_538) }, dates: { early: d('2045-11-23'), middle: d('2045-11-23'), late: null } }
    expect(whatIf({ ...base, goal: { ...base.goal, pace } }).goal).toEqual({
      status: 'sooner',
      rough: false,
      dates: { early: '2045-11-09', middle: '2045-11-09', late: null },
      weeksSooner: 2,
    })
  })
})

describe('whatIfLines when the saving alone would take past year 9999 (F48)', () => {
  // Flight training on no fund, $17,350.00 to go: 5 cents a month is a cent a week, 1,735,000 weeks.
  const FLIGHT: AskGoal = { name: 'Flight training', targetCents: 3_000_000, savedCents: 1_265_000, targetDate: null, fundCategoryId: null, unitCostCents: 27_500 }
  const GOALS: OutlookBase = { asOf: d('2026-09-24'), historyStart: d('2026-05-01'), readFrom: d('2025-09-01'), categories: [], budgetHistory: [], planHistory: [], entries: [], goals: [FLIGHT] }

  it('says the saving is too little to give a date, with no date to fill', () => {
    expect(whatIfLines(GOALS, null, [], 5)).toEqual({
      main: { say: 'what_if_too_small', names: [], figures: { monthly: { unit: 'cents', value: 5 } } },
      rows: [{ say: 'goal', names: ['Flight training'], figures: {} }],
    })
  })

  it('names the month for a saving that has one', () => {
    // $100.00 a month, $23.08 a week: ceil(1,735,000 / 2,308) = 752 weeks, 2041-02-21.
    expect(whatIfLines(GOALS, null, [], 10_000).main).toEqual({
      say: 'what_if_alone',
      names: [],
      figures: { monthly: { unit: 'cents', value: 10_000 }, date: { unit: 'month_year', value: '2041-02-21' } },
    })
  })
})
