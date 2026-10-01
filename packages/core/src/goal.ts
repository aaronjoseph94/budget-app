/**
 * Savings goals and their cost in something other than money.
 *
 * NOT workbook-derived. The workbook's Savings sheet tracks seven fixed funds
 * with a manually maintained "Current Amount" cell and a required monthly
 * contribution; it has no concept of a unit conversion and no weekly cadence.
 * These functions are a new capability, so their tests are independently
 * derived rather than golden-replayed. See docs/divergences.md D2 for the
 * precedent.
 *
 * The unit conversion exists because a goal denominated in something the user
 * actually wants is stronger than one denominated in currency. $30,000 is
 * abstract; 109 hours of flight instruction is not.
 */
import {
  type Cents,
  type IsoDate,
  ZERO_CENTS,
  addDays,
  cents,
  daysBetween,
  subCents,
} from '@budget/money-primitives'
import { shareOf } from './shares.js'

export interface SavingsGoal {
  readonly name: string
  readonly targetCents: number
  readonly savedCents: number
  /** Cost of one unit of the thing being saved for, e.g. an hour of instruction. */
  readonly unitCostCents?: number
  readonly unitLabel?: string
}

export interface GoalProgress {
  readonly remainingCents: Cents
  /** Basis points, so progress is never a float. 4518 = 45.18%. */
  readonly percentCompleteBasisPoints: number
  readonly unitsRemaining: number | null
  readonly unitsEarned: number | null
}

export function goalProgress(goal: SavingsGoal): GoalProgress {
  const target = cents(goal.targetCents)
  const saved = cents(goal.savedCents)
  if (target <= 0) throw new RangeError(`Goal "${goal.name}" must have a positive target`)

  const remaining = saved >= target ? ZERO_CENTS : subCents(target, saved)
  const unitCost = goal.unitCostCents === undefined ? undefined : cents(goal.unitCostCents)

  return {
    remainingCents: remaining,
    // The same rule as fundProgress, so the Sidebar, the Week and Savings
    // print one figure for one fund: a fund withdrawals took under zero is
    // 0%, never a negative share (architecture-a-01).
    percentCompleteBasisPoints: saved <= 0 ? 0 : saved >= target ? 10_000 : shareOf(saved, target),
    unitsRemaining: unitCost && unitCost > 0 ? Math.floor(remaining / unitCost) : null,
    unitsEarned: unitCost && unitCost > 0 ? (saved <= 0 ? 0 : Math.floor(saved / unitCost)) : null,
  }
}

export interface GoalProjection {
  readonly weeksRemaining: number | null
  readonly projectedDate: IsoDate | null
}

/**
 * When a weekly contribution lands the goal. Returns nulls rather than a
 * fabricated date when the contribution is zero — "never" is the honest
 * answer, and CONSTRAINTS.md forbids a silent numeric fallback here.
 */
export function projectGoal(
  goal: SavingsGoal,
  weeklyContributionCents: number,
  asOf: IsoDate,
): GoalProjection {
  const weekly = cents(weeklyContributionCents)
  const { remainingCents } = goalProgress(goal)

  if (remainingCents === 0) return { weeksRemaining: 0, projectedDate: asOf }
  if (weekly <= 0) return { weeksRemaining: null, projectedDate: null }

  const weeks = Math.ceil(remainingCents / weekly)
  return { weeksRemaining: weeks, projectedDate: addDays(asOf, weeks * 7) }
}

/** The weekly contribution that lands the goal on `targetDate`. */
export function requiredWeeklyContribution(
  goal: SavingsGoal,
  asOf: IsoDate,
  targetDate: IsoDate,
): Cents {
  const { remainingCents } = goalProgress(goal)
  if (remainingCents === 0) return ZERO_CENTS

  const days = daysBetween(asOf, targetDate)
  if (days <= 0) {
    throw new RangeError(
      `Target date ${targetDate} is not after ${asOf}; no weekly contribution can reach it.`,
    )
  }
  return cents(Math.ceil(remainingCents / (days / 7)))
}

export interface TimeEquivalent {
  readonly totalMinutes: number
  readonly hours: number
  readonly minutes: number
}

/**
 * What a purchase costs in goal-units, for the tradeoff framing.
 * At $275/hr, an $80 dinner is 17 minutes of flight time.
 */
export function timeEquivalent(amountCents: number, unitCostPerHourCents: number): TimeEquivalent {
  const amount = cents(amountCents)
  const rate = cents(unitCostPerHourCents)
  if (rate <= 0) throw new RangeError('Unit cost per hour must be positive')

  const totalMinutes = Math.round((amount * 60) / rate)
  return {
    totalMinutes,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  }
}
