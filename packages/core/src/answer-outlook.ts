/**
 * Ask about your money: the answers that look ahead (F48,
 * docs/formula-decisions.md; plan slice A24): where the month ends, what
 * is safe to spend, when each goal is reached, and what a saving would do.
 *
 * Each is the engine function the Forecast and Savings already show (F30,
 * F31, F33, F34, F35), so Ask never disagrees with them. Goals are plural
 * (G1): every active goal, the main goal first; hours only where a goal has
 * a cost an hour, which the screen reads from the goal, not from here.
 *
 * NOT workbook-derived. The tests are worked by hand.
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import type { AnswerLine, Lines, SpendingBase } from './answer-spending.js'
import type { Figure } from './digest.js'
import type { IncomeSchedule } from './expected-pay.js'
import { type ForecastGoal, type GoalForecast, goalForecast } from './goal-forecast.js'
import { goalLevers } from './levers.js'
import { monthEndForecast } from './month-end.js'
import { safeToSpend } from './safe-to-spend.js'
import { whatIf } from './what-if.js'

/** An active goal, as Savings orders them (F45). */
export interface AskGoal extends ForecastGoal {
  readonly name: string
  readonly unitCostCents: number | null
}

export interface OutlookBase extends SpendingBase {
  /** The active goals, the main goal first. */
  readonly goals: readonly AskGoal[]
}

/** The pay schedules and this month's typed start the forecast needs (F29 to F31). */
export interface ForecastRead {
  readonly paySchedules: readonly IncomeSchedule[]
  readonly startingBalanceCents: number | null
}

const month$ = (value: IsoDate): Figure => ({ unit: 'month_year', value })
const dollars = (value: Cents): Figure => ({ unit: 'dollars', value })
const one = (say: AnswerLine['say'], names: readonly string[] = [], figures: AnswerLine['figures'] = {}): AnswerLine => ({ say, names, figures })
const alone = (main: AnswerLine): Lines => ({ main, rows: [] })

/** Where the month ends (F30), or what is safe to spend a day (F31), as the Forecast shows them. */
export function forecastLines(base: SpendingBase, forecast: ForecastRead, intent: 'forecast' | 'safe_to_spend'): Lines {
  const input = { ...base, ...forecast }
  if (intent === 'safe_to_spend') {
    const safe = safeToSpend(input)
    if (safe.perDayCents === null) return alone(one('no_start'))
    if (safe.status === 'nothing_left') return alone(one('nothing_left'))
    return alone(one('safe', [], { per_day: { unit: 'cents', value: safe.perDayCents }, days: { unit: 'count', value: safe.days } }))
  }
  const month = monthEndForecast(input)
  if (month.status === 'too_early') return alone(one('too_early', [], month.checkBackOn === null ? {} : { date: { unit: 'date', value: month.checkBackOn } }))
  if (month.end === null) return alone(one('no_start'))
  const { low, mid, high } = month.end
  return alone(month.status === 'rough' ? one('forecast_rough', [], { mid: dollars(mid) }) : one('forecast_range', [], { low: dollars(low), mid: dollars(mid), high: dollars(high) }))
}

function forecastOf(base: SpendingBase, goal: AskGoal): GoalForecast {
  return goalForecast({ asOf: base.asOf, historyStart: base.historyStart, readFrom: base.readFrom, categories: base.categories, entries: base.entries, goal })
}

/** One goal's date at the owner's pace (F33). */
function goalLine(goal: AskGoal, forecast: GoalForecast): AnswerLine {
  const names = [goal.name]
  const { pace } = forecast
  switch (pace.status) {
    case 'met':
      return one('goal_met', names)
    case 'no_fund':
      return one('goal_no_fund', names)
    case 'no_pace':
      return one('goal_no_pace', names)
    case 'too_early':
      return pace.possibleFrom === null ? one('goal_no_records', names) : one('goal_too_early', names, { date: { unit: 'date', value: pace.possibleFrom } })
    case 'rough':
      return one('goal_rough', names, { middle: month$(pace.date) })
    case 'range': {
      const { early, middle, late } = pace.dates
      return late === null
        ? one('goal_range_open', names, { early: month$(early), middle: month$(middle) })
        : one('goal_range', names, { early: month$(early), middle: month$(middle), late: month$(late) })
    }
  }
}

/** Every active goal's date, the main goal first. */
export function goalDateLines(base: OutlookBase): Lines {
  const [main, ...rows] = base.goals.map((g) => goalLine(g, forecastOf(base, g)))
  return main === undefined ? alone(one('no_goals')) : { main, rows }
}

/**
 * A month's saving applied to the main goal (F35's whatIf): the amount the
 * question named, else the category's F34 quarter lever, or its best month
 * when the quarter rounds to nothing. The goal is the answer's one row, so
 * its sentence can name it.
 */
export function whatIfLines(base: OutlookBase, forecast: ForecastRead | null, categoryIds: readonly string[], monthlyCents: number | null): Lines {
  const goal = base.goals[0]
  if (goal === undefined) return alone(one('no_goals'))
  const paced = forecastOf(base, goal)
  const category = categoryIds.map((id) => base.categories.find((c) => c.id === id)).find((c) => c !== undefined)
  const names = category === undefined ? [] : [category.name]
  const monthly = monthlyCents ?? leverFor(base, goal, paced, category?.id)
  if (monthly === null || monthly <= 0) return alone(one('no_saving', names))
  const end = forecast === null ? null : monthEndForecast({ ...base, ...forecast }).end
  const result = whatIf({ asOf: base.asOf, monthlyCents: monthly, end, goal: { remainingCents: paced.remainingCents, pace: paced.pace, unitCostCents: goal.unitCostCents } })
  const saving: Figure = { unit: 'cents', value: cents(monthly) }
  const rows = [one('goal', [goal.name])]
  switch (result.goal.status) {
    case 'met':
      return { main: one('what_if_met', names), rows }
    case 'alone':
      return { main: one('what_if_alone', names, { monthly: saving, date: month$(result.goal.date) }), rows }
    case 'sooner': {
      const { pace } = paced
      // whatIf is sooner only from a rough or ranged pace, which always has a middle date.
      const was = pace.status === 'rough' ? pace.date : pace.status === 'range' ? pace.dates.middle : result.goal.dates.middle
      return { main: one('what_if_sooner', names, { monthly: saving, middle: month$(result.goal.dates.middle), was: month$(was) }), rows }
    }
  }
}

function leverFor(base: SpendingBase, goal: AskGoal, paced: GoalForecast, categoryId: string | undefined): number | null {
  if (categoryId === undefined) return null
  const { levers } = goalLevers({
    asOf: base.asOf,
    historyStart: base.historyStart,
    readFrom: base.readFrom,
    categories: base.categories,
    entries: base.entries,
    goal: { remainingCents: paced.remainingCents, unitCostCents: goal.unitCostCents },
    paceWeeklyCents: paced.paceWeeklyCents,
  })
  const mine = levers.filter((l) => l.categoryId === categoryId)
  const chosen = mine.find((l) => l.kind === 'quarter') ?? mine.find((l) => l.kind === 'best_month')
  return chosen === undefined ? null : chosen.monthlyCents
}
