/**
 * When a savings goal is reached at the owner's own pace (F33,
 * docs/formula-decisions.md; plan slice A08).
 *
 * NOT workbook-derived. The workbook's Savings tab works a monthly figure
 * back from a typed goal date (F21) and never looks at what was really
 * moved in. This looks forward from it: the fund's Savings Actual in each
 * complete month is the pace, and projectGoal turns a pace into a date. Any
 * goal, not only flight training (G1): nothing here knows what it is for.
 *
 * Honest about thin history: under three complete months there is one
 * rough date, never an invented range, and with none there is no date at
 * all, only the month one becomes possible.
 */
import { type Cents, type IsoDate, ZERO_CENTS, cents, subCents } from '@budget/money-primitives'
import { projectGoal, requiredWeeklyContribution } from './goal.js'
import { type Evidence, completeMonths, evidenceOf } from './history.js'
import { monthActuals } from './month-actuals.js'
import type { PeriodCategory, PeriodEntry } from './period-sheet.js'
import { median, quantile } from './stats.js'
import { monthBounds, shiftMonth } from './week.js'

export interface ForecastGoal {
  readonly targetCents: number
  /** Saved now: its fund's balance kept by transfers (D16), or the amount typed on no fund. */
  readonly savedCents: number
  readonly targetDate: IsoDate | null
  /** The Savings-list fund it is on; null on no fund, where nothing moved in can be measured. */
  readonly fundCategoryId: string | null
}

export interface GoalForecastInput {
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers. A month before it was not read, so it is missing, not $0. */
  readonly readFrom: IsoDate
  /** Every category the entries name. */
  readonly categories: readonly PeriodCategory[]
  readonly entries: readonly PeriodEntry[]
  readonly goal: ForecastGoal
}

export interface Paces {
  readonly low: Cents
  readonly middle: Cents
  readonly high: Cents
}

export type GoalPace =
  | { readonly status: 'met' }
  /** On no fund, or on one moved off the Savings list (N52): nothing moved in is measured. */
  | { readonly status: 'no_fund' }
  /** No complete month yet; `possibleFrom` is the day the first one completes, null with no records. */
  | { readonly status: 'too_early'; readonly possibleFrom: IsoDate | null }
  /** The middle pace saves nothing, so there is no date. */
  | { readonly status: 'no_pace'; readonly months: number; readonly evidence: Evidence }
  /** One or two complete months: the middle pace's one date, labelled rough. */
  | { readonly status: 'rough'; readonly months: number; readonly evidence: Evidence; readonly weeklyCents: Cents; readonly date: IsoDate }
  | {
      readonly status: 'range'
      readonly months: number
      readonly evidence: Evidence
      readonly weekly: Paces
      /** Early from the high pace, middle from the middle; no late date when the low pace saves nothing. */
      readonly dates: { readonly early: IsoDate; readonly middle: IsoDate; readonly late: IsoDate | null }
    }

export interface GoalForecast {
  /** Target less saved, never below zero. */
  readonly remainingCents: Cents
  readonly pace: GoalPace
  /** The middle weekly pace, which a lever is set against (F34); null with none. */
  readonly paceWeeklyCents: Cents | null
  /** What a week must add to land a target date still ahead; null with none, or the target met. */
  readonly neededWeeklyCents: Cents | null
}

/** A pace is taken over at most this many of the latest complete months. */
const PACE_MONTHS = 6

export function goalForecast(input: GoalForecastInput): GoalForecast {
  const { asOf, goal } = input
  const asSavingsGoal = { name: 'goal', targetCents: goal.targetCents, savedCents: goal.savedCents }
  const target = cents(goal.targetCents)
  const saved = cents(goal.savedCents)
  const remaining = saved >= target ? ZERO_CENTS : subCents(target, saved)
  const needed =
    remaining === 0 || goal.targetDate === null || goal.targetDate <= asOf
      ? null
      : requiredWeeklyContribution(asSavingsGoal, asOf, goal.targetDate)
  const without = (pace: GoalPace): GoalForecast => ({ remainingCents: remaining, pace, paceWeeklyCents: null, neededWeeklyCents: needed })
  if (remaining === 0) return without({ status: 'met' })

  const fund = input.categories.find((c) => c.id === goal.fundCategoryId && c.kind === 'savings')
  if (fund === undefined) return without({ status: 'no_fund' })
  const months = completeMonths(input).months.slice(0, PACE_MONTHS)
  if (months.length === 0) return without({ status: 'too_early', possibleFrom: firstComplete(input) })

  const values = monthActuals({ categories: input.categories, entries: input.entries, months }).months.map(
    (m) => m.actuals.get(fund.id) ?? missing(fund.id),
  )
  const evidence = evidenceOf(months.length)
  const middle = weekly(median({ values }))
  if (middle <= 0) return without({ status: 'no_pace', months: months.length, evidence })

  const dateAt = (weeklyCents: Cents): IsoDate | null => projectGoal(asSavingsGoal, weeklyCents, asOf).projectedDate
  const paced = (pace: GoalPace): GoalForecast => ({ remainingCents: remaining, pace, paceWeeklyCents: middle, neededWeeklyCents: needed })
  // A middle pace above $0 always lands, so its date is never null.
  const middleDate = dateAt(middle) ?? missing(fund.id)
  if (months.length < 3) return paced({ status: 'rough', months: months.length, evidence, weeklyCents: middle, date: middleDate })

  const low = weekly(quantile({ values, pBp: 2_500 }))
  const high = weekly(quantile({ values, pBp: 7_500 }))
  return paced({
    status: 'range',
    months: months.length,
    evidence,
    weekly: { low, middle, high },
    // The high pace is at least the middle, so it lands too.
    dates: { early: dateAt(high) ?? missing(fund.id), middle: middleDate, late: dateAt(low) },
  })
}

/** Monthly × 12 ÷ 52, half-up on the magnitude with the sign kept, as F26 rounds. */
function weekly(monthly: number | null): Cents {
  if (monthly === null) throw new RangeError('A pace needs at least one complete month')
  const size = BigInt(Math.abs(monthly)) * 12n
  const half = Number((size * 2n + 52n) / 104n)
  // From zero, not negated, so a pace that rounds to nothing is 0 and not -0.
  return cents(monthly < 0 ? 0 - half : half)
}

/** The day the first complete month ends: the first whole month on or after the records and the read begin. */
function firstComplete(input: GoalForecastInput): IsoDate | null {
  if (input.historyStart === null) return null
  const first = input.historyStart > input.readFrom ? input.historyStart : input.readFrom
  const whole = first === monthBounds(first).start ? first : shiftMonth(first, 1)
  return shiftMonth(whole, 1)
}

/** The engine's own sheets list every category given, and a pace above $0 always lands, so neither can miss. */
function missing(categoryId: string): never {
  throw new RangeError(`The pace of fund ${categoryId} could not be read from its sheets`)
}
