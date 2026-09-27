import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { forecastLines, goalDateLines, whatIfLines, type AskGoal, type OutlookBase } from '../src/answer-outlook.js'
import { monthEndForecast, safeToSpend } from '../src/index.js'
import { BASE } from './ask-example.js'

/** Suite tests, worked by hand from F48, on F33's worked example (docs/formula-decisions.md). */

const d = isoDate
const month = (value: string) => ({ unit: 'month_year', value })
/** Money moved into a fund is a negative ledger row, as on the Month (D3). */
const row = (postedOn: string, dollars: number, categoryId: string) => ({
  id: `o-${postedOn}-${categoryId}`,
  postedOn: d(postedOn),
  amountCents: -dollars * 100,
  categoryId,
  shop: '',
  by: 'statement' as const,
})

const FLIGHT: AskGoal = { name: 'Flight training', targetCents: 3_000_000, savedCents: 1_265_000, targetDate: null, fundCategoryId: 'fund', unitCostCents: 27_500 }
const LAPTOP: AskGoal = { name: 'Laptop', targetCents: 150_000, savedCents: 20_000, targetDate: null, fundCategoryId: null, unitCostCents: null }

/** F33's example: records from 1 May, May to August moved into the fund; Dining out $90.00 a month. */
const GOALS: OutlookBase = {
  asOf: d('2026-09-24'),
  historyStart: d('2026-05-01'),
  readFrom: d('2025-09-01'),
  categories: [
    { id: 'fund', name: 'Flight fund', kind: 'savings', sortOrder: 0, weeklyBudgetCents: null },
    { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 1, weeklyBudgetCents: null },
  ],
  budgetHistory: [],
  planHistory: [],
  entries: [
    row('2026-05-15', 400, 'fund'),
    row('2026-06-01', 400, 'fund'),
    row('2026-06-15', 250, 'fund'),
    row('2026-07-15', 500, 'fund'),
    row('2026-08-15', 300, 'fund'),
    row('2026-05-20', 90, 'dining'),
    row('2026-06-20', 90, 'dining'),
    row('2026-07-20', 90, 'dining'),
    row('2026-08-20', 90, 'dining'),
  ],
  goals: [FLIGHT, LAPTOP],
}

describe('goalDateLines (F48, F33)', () => {
  it('gives every active goal’s date at the owner’s pace, the main goal first', () => {
    expect(goalDateLines(GOALS)).toEqual({
      main: { say: 'goal_range', names: ['Flight training'], figures: { early: month('2029-08-16'), middle: month('2029-12-13'), late: month('2031-07-17') } },
      rows: [{ say: 'goal_no_fund', names: ['Laptop'], figures: {} }],
    })
  })

  it('gives one rough date under three complete months, and says when a goal is reached', () => {
    expect(goalDateLines({ ...GOALS, historyStart: d('2026-07-01'), goals: [FLIGHT] }).main).toEqual({
      say: 'goal_rough',
      names: ['Flight training'],
      figures: { middle: month('2030-05-02') },
    })
    expect(goalDateLines({ ...GOALS, goals: [{ ...FLIGHT, savedCents: 3_000_000 }] }).main.say).toBe('goal_met')
    expect(goalDateLines({ ...GOALS, goals: [] })).toEqual({ main: { say: 'no_goals', names: [], figures: {} }, rows: [] })
  })
})

describe('whatIfLines (F48, F34, F35)', () => {
  it('applies the amount the question named to the main goal, as a month’s saving', () => {
    // $100.00 a month is $23.08 a week: $103.85 + $23.08 reaches $17,350.00 in 137 weeks.
    expect(whatIfLines(GOALS, null, ['dining'], 10_000)).toEqual({
      main: { say: 'what_if_sooner', names: ['Dining out'], figures: { monthly: { unit: 'cents', value: 10_000 }, middle: month('2029-05-10'), was: month('2029-12-13') } },
      rows: [{ say: 'goal', names: ['Flight training'], figures: {} }],
    })
  })

  it('takes the category’s quarter lever when the question named no amount', () => {
    // A quarter of $90.00, to the nearest $5: $25.00 a month, $5.77 a week, 159 weeks.
    expect(whatIfLines(GOALS, null, ['dining'], null).main.figures).toEqual({
      monthly: { unit: 'cents', value: 2_500 },
      middle: month('2029-10-11'),
      was: month('2029-12-13'),
    })
  })

  it('has nothing to suggest with no amount and no lever, and nothing to reach with no goal', () => {
    expect(whatIfLines(GOALS, null, [], null).main).toEqual({ say: 'no_saving', names: [], figures: {} })
    expect(whatIfLines({ ...GOALS, goals: [] }, null, ['dining'], 10_000).main.say).toBe('no_goals')
    expect(whatIfLines({ ...GOALS, goals: [{ ...FLIGHT, savedCents: 3_000_000 }] }, null, ['dining'], 10_000).main.say).toBe('what_if_met')
  })

  it('reaches a goal with no pace by the saving alone', () => {
    expect(whatIfLines({ ...GOALS, goals: [{ ...FLIGHT, fundCategoryId: null }] }, null, [], 10_000).main).toMatchObject({ say: 'what_if_alone' })
  })
})

describe('forecastLines (F48, F30, F31)', () => {
  const read = { paySchedules: [], startingBalanceCents: 500_000 }

  it('is the Forecast’s month end and safe to spend, figure for figure', () => {
    const end = monthEndForecast({ ...BASE, ...read })
    const lines = forecastLines(BASE, read, 'forecast').main
    expect(end.status).toBe('range')
    expect(lines).toEqual({
      say: 'forecast_range',
      names: [],
      figures: { low: { unit: 'dollars', value: end.end?.low }, mid: { unit: 'dollars', value: end.end?.mid }, high: { unit: 'dollars', value: end.end?.high } },
    })
    const safe = safeToSpend({ ...BASE, ...read })
    expect(forecastLines(BASE, read, 'safe_to_spend').main).toEqual({
      say: 'safe',
      names: [],
      figures: { per_day: { unit: 'cents', value: safe.perDayCents }, days: { unit: 'count', value: 7 } },
    })
  })

  it('asks for a starting balance, and says when it is too early', () => {
    const none = { paySchedules: [], startingBalanceCents: null }
    expect(forecastLines(BASE, none, 'forecast').main.say).toBe('no_start')
    expect(forecastLines(BASE, none, 'safe_to_spend').main.say).toBe('no_start')
    expect(forecastLines({ ...BASE, asOf: d('2026-06-05') }, read, 'forecast').main).toEqual({ say: 'too_early', names: [], figures: { date: { unit: 'date', value: '2026-06-07' } } })
  })

  it('says when nothing is left to spend safely', () => {
    // $3,000.00 came in and $1,591.00 went out: an overdrawn start of $2,000.00 leaves nothing.
    expect(forecastLines(BASE, { paySchedules: [], startingBalanceCents: -200_000 }, 'safe_to_spend').main.say).toBe('nothing_left')
  })
})
