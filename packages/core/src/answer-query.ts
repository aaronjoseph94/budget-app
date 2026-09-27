/**
 * Ask about your money: one question's answer, every figure in it worked
 * out in core (F48, docs/formula-decisions.md; plan slice A24; ADR 0005 §7).
 *
 * The AI, or the app's own matching, only reads a question into an intent,
 * up to three categories, a period and an amount. This works out the answer
 * from the owner's records with the engine functions each screen already
 * uses, so Ask never disagrees with the Month, the Forecast, Savings, Reports
 * or Debts. An answer names the sentence to say it in and the figures to fill
 * it with; the words are the app's own, in savings-coach.
 *
 * NOT workbook-derived. The tests are worked by hand.
 */
import { sumCents } from '@budget/money-primitives'
import { type AskPeriod, askWindow } from './ask-window.js'
import {
  type Answer,
  type AnswerLine,
  type Lines,
  budgetLeft,
  compareIn,
  explainMonth,
  spendIn,
  topCategories,
  topShopsIn,
} from './answer-spending.js'
import { type ForecastRead, type OutlookBase, forecastLines, goalDateLines, whatIfLines } from './answer-outlook.js'
import { type DebtPlanInput, debtPlan } from './debt-plan.js'
import { recurringCharges } from './recurring.js'
import { monthBounds } from './week.js'

/** What a question can ask, less `help`, which opens an article and has no figure. */
export type AskIntent =
  | 'spend_in'
  | 'compare'
  | 'top_categories'
  | 'top_shops'
  | 'subscriptions'
  | 'forecast'
  | 'safe_to_spend'
  | 'goal_date'
  | 'what_if_cut'
  | 'debt_free'
  | 'explain_month'
  | 'budget_left'

export interface AskQuery {
  readonly intent: AskIntent
  /** Null when the question named none: this month, for the intents that take one. */
  readonly period: AskPeriod | null
  /** Up to three, in the order asked; empty for all of the spending. */
  readonly categoryIds: readonly string[]
  /** A month's saving the question named, for what_if_cut; null when it named none. */
  readonly monthlyCents: number | null
}

export interface AnswerQueryInput extends OutlookBase {
  readonly query: AskQuery
  /** The forecast's reads; null when they did not load. */
  readonly forecast: ForecastRead | null
  /** The payoff plan's debts and extras; null when they did not load. */
  readonly debts: DebtPlanInput | null
  /** Shops marked Not a subscription. */
  readonly notSubscriptions: readonly string[]
}

const THIS_MONTH: AskPeriod = { kind: 'this_month' }
const one = (say: AnswerLine['say'], names: readonly string[] = [], figures: AnswerLine['figures'] = {}): AnswerLine => ({ say, names, figures })
const answered = ({ main, rows }: Lines, days: Pick<Extract<Answer, { status: 'answered' }>, 'now' | 'before' | 'cutFrom'> | null = null): Answer => ({
  status: 'answered',
  now: days === null ? null : days.now,
  before: days === null ? null : days.before,
  cutFrom: days === null ? null : days.cutFrom,
  main,
  rows,
})

export function answerQuery(input: AnswerQueryInput): Answer {
  const { query } = input
  switch (query.intent) {
    case 'spend_in':
    case 'compare':
    case 'top_categories':
    case 'top_shops':
    case 'explain_month':
      return overDays(input, query)
    case 'budget_left':
      return answered(budgetLeft(input, query.period?.kind === 'this_week', query.categoryIds))
    case 'subscriptions':
      return answered(subscriptions(input))
    case 'forecast':
    case 'safe_to_spend':
      return input.forecast === null ? { status: 'missing', what: 'forecast' } : answered(forecastLines(input, input.forecast, query.intent))
    case 'goal_date':
      return answered(goalDateLines(input))
    case 'what_if_cut':
      return answered(whatIfLines(input, input.forecast, query.categoryIds, query.monthlyCents))
    case 'debt_free':
      return input.debts === null ? { status: 'missing', what: 'debts' } : answered(debtFree(input.debts))
  }
}

/** The intents about a stretch of days: the window first (F48), then the figures over it. */
function overDays(input: AnswerQueryInput, query: AskQuery): Answer {
  const asked = query.period ?? THIS_MONTH
  // Explaining is about one month, as the Month shows it: a week or a year asks about this one.
  const oneMonth = asked.kind === 'month' || asked.kind === 'this_month' || asked.kind === 'last_month'
  const period = query.intent === 'explain_month' && !oneMonth ? THIS_MONTH : asked
  const window = askWindow({ asOf: input.asOf, historyStart: input.historyStart, readFrom: input.readFrom, period })
  if (window.status !== 'ready') return window
  const { now, before, cutFrom } = window
  const days = { now, before: query.intent === 'compare' ? before : null, cutFrom }
  switch (query.intent) {
    case 'compare':
      return answered({ main: compareIn(input, now, before, query.categoryIds), rows: [] }, days)
    case 'top_categories':
      return answered(topCategories(input, now), days)
    case 'top_shops':
      return answered(topShopsIn(input, now), days)
    case 'explain_month':
      return answered(explainMonth(input, now.to), days)
    default:
      return answered({ main: spendIn(input, now, query.categoryIds), rows: [] }, days)
  }
}

/** F38's regular charges, less those marked Not a subscription: how many, a year's cost, and the three dearest. */
function subscriptions(input: AnswerQueryInput): Lines {
  const { series } = recurringCharges(input)
  if (series.length === 0) return { main: one('no_subscriptions'), rows: [] }
  const year = sumCents(series.map((s) => s.yearCents))
  // recurringCharges lists the dearest a year first.
  const rows = series.slice(0, 3).map((s) => one('subscription', [s.shop], { price: { unit: 'cents', value: s.priceCents }, year: { unit: 'cents', value: s.yearCents } }))
  return { main: one('subscriptions', [], { count: { unit: 'count', value: series.length }, year: { unit: 'cents', value: year } }), rows }
}

/** The payoff plan's debt-free date, as Debts and the Forecast show it. */
function debtFree(debts: DebtPlanInput): Lines {
  if (debts.debts.length === 0) return { main: one('no_debts'), rows: [] }
  const plan = debtPlan(debts)
  if (plan.amortization === null || plan.neverPaidOff.length > 0) return { main: one('never_paid_off', plan.neverPaidOff), rows: [] }
  return { main: one('debt_free', [], { month: { unit: 'month_year', value: monthBounds(plan.amortization.debtFreeDate).start } }), rows: [] }
}
