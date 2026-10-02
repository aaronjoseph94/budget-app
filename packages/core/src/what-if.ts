/**
 * What if a month's saving were made (F35's what-if, docs/formula-decisions.md;
 * plan slice A14): a lever of F34, or any saving, applied to this month's
 * end (F30) and to one goal's date (F33).
 *
 * NOT workbook-derived. Pure and quick, so a what-if chip is worked out on
 * the phone from figures already loaded, with nothing read or asked. Any
 * goal, not only flight training (G1).
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import { projectGoal, timeEquivalent } from './goal.js'
import type { GoalPace } from './goal-forecast.js'
import { type Spread, toTen } from './month-end.js'
import { monthBounds } from './week.js'

export interface WhatIfInput {
  readonly asOf: IsoDate
  /** A month's saving, 0 or more. */
  readonly monthlyCents: number
  /** F30's month end; null with no start typed, or before it has one. */
  readonly end: { readonly low: number; readonly mid: number; readonly high: number } | null
  readonly goal: {
      /** From goalForecast. */
    readonly remainingCents: number
    readonly pace: GoalPace
    readonly unitCostCents: number | null
  }
}

export type WhatIfGoal =
  | { readonly status: 'met' }
  /** With no pace: the saving alone reaches the goal in `weeks`. */
  | { readonly status: 'alone'; readonly weeks: number; readonly date: IsoDate }
  /** Each pace plus the saving; rough keeps one date, in all three places. No late date when the low pace still saves nothing. */
  | {
      readonly status: 'sooner'
      readonly rough: boolean
      readonly dates: { readonly early: IsoDate; readonly middle: IsoDate; readonly late: IsoDate | null }
      /** At the middle pace (F34). */
      readonly weeksSooner: number
    }

export interface WhatIf {
  readonly weeklyCents: Cents
  /** What the saving keeps of this month's days left. */
  readonly keptThisMonthCents: Cents
  /** F30's ends with it kept, to $10; null with none. */
  readonly end: Spread | null
  readonly goal: WhatIfGoal
  /** A month's saving in whole minutes of the goal's unit; null for a goal in dollars. */
  readonly minutesPerMonth: number | null
}

export function whatIf(input: WhatIfInput): WhatIf {
  const monthly = cents(input.monthlyCents)
  if (monthly < 0) throw new RangeError(`A what-if saves 0 or more a month, received ${monthly}`)
  const weekly = cents(halfUp(BigInt(monthly) * 12n, 52n))
  const d = Number(input.asOf.slice(8))
  const D = Number(monthBounds(input.asOf).end.slice(8))
  const kept = cents(halfUp(BigInt(monthly) * BigInt(D - d), BigInt(D)))
  const { end } = input
  const rate = input.goal.unitCostCents
  return {
    weeklyCents: weekly,
    keptThisMonthCents: kept,
    end: end === null ? null : { low: toTen(end.low + kept), mid: toTen(end.mid + kept), high: toTen(end.high + kept) },
    goal: goalWith(input, weekly),
    minutesPerMonth: rate === null ? null : timeEquivalent({ amountCents: monthly, unitCostPerHourCents: rate }).totalMinutes,
  }
}

function goalWith(input: WhatIfInput, weekly: Cents): WhatIfGoal {
  const { pace, remainingCents } = input.goal
  const remaining = cents(remainingCents)
  if (pace.status === 'met' || remaining <= 0) return { status: 'met' }
  const goal = { name: 'goal', targetCents: remaining, savedCents: 0 }
  const at = (perWeek: number): IsoDate | null => projectGoal({ goal, weeklyContributionCents: perWeek, asOf: input.asOf }).projectedDate
  const weeks = (perWeek: number) => Math.ceil(remaining / perWeek)
  if (pace.status !== 'rough' && pace.status !== 'range') {
    // A saving of $0 reaches nothing; a lever is never $0 (F34), so this is a caller's slip.
    const date = at(weekly)
    if (date === null) throw new RangeError('A what-if with no pace needs a saving above $0')
    return { status: 'alone', weeks: weeks(weekly), date }
  }
  const middle = pace.status === 'rough' ? pace.weeklyCents : pace.weekly.middle
  // A middle pace above $0 plus a saving of 0 or more always lands.
  const middleDate = at(middle + weekly)!
  const weeksSooner = weeks(middle) - weeks(middle + weekly)
  if (pace.status === 'rough') return { status: 'sooner', rough: true, dates: { early: middleDate, middle: middleDate, late: middleDate }, weeksSooner }
  return {
    status: 'sooner',
    rough: false,
    dates: { early: at(pace.weekly.high + weekly)!, middle: middleDate, late: at(pace.weekly.low + weekly) },
    weeksSooner,
  }
}

/** part ÷ whole for a part of 0 or more, half-up. */
function halfUp(part: bigint, whole: bigint): number {
  return Number((part * 2n + whole) / (2n * whole))
}
