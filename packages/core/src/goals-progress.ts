/**
 * How far along every savings goal is (formula decision F45, plan slice G1).
 *
 * NOT workbook-derived: the workbook's Savings tab has one card per fund and
 * no goal in hours (D28). Kept apart from goals.ts, which orders the goals,
 * because the app's first load needs the order and not this.
 */
import { type Cents, ZERO_CENTS, cents, subCents } from '@budget/money-primitives'
import { timeEquivalent } from './goal.js'
import { fundProgress } from './savings.js'

export interface GoalAmounts {
  readonly id: string
  readonly targetCents: number
  /** The fund's balance kept by transfers when the goal is a fund's (D16); otherwise the amount typed. */
  readonly savedCents: number
  /** What an hour of what the goal is for costs, e.g. $275.00 of flight time; null for a goal in dollars. */
  readonly unitCostCents: number | null
}

export interface GoalsProgressInput {
  readonly goals: readonly GoalAmounts[]
}

export interface GoalFigures {
  readonly id: string
  readonly savedCents: Cents
  readonly targetCents: Cents
  /** Target less saved, never below zero. */
  readonly remainingCents: Cents
  /** Saved of target in basis points, 0 to 10,000: the bar's length. */
  readonly progressBp: number
  /** Saved is at or above the target. */
  readonly targetMet: boolean
  /** Nothing is saved, so removing the goal loses no balance (F45). */
  readonly empty: boolean
  /** Whole hours saved, of the whole hours the target buys. Null with no cost per hour, or with less than nothing saved. */
  readonly hours: { readonly saved: number; readonly target: number } | null
}

export interface GoalsProgressOutput {
  /** One per goal, in the order given. */
  readonly goals: readonly GoalFigures[]
}

/**
 * How far along every goal is (F45): the bar as the Savings cards draw it
 * (fundProgress, F17's half-up basis points, 0 at or below $0 and full at
 * the target), what is left, and, for a goal with a cost per hour, the hours
 * as the flight card counts them (timeEquivalent's whole hours, F33).
 */
export function goalsProgress(input: GoalsProgressInput): GoalsProgressOutput {
  return {
    goals: input.goals.map((g): GoalFigures => {
      const saved = cents(g.savedCents)
      const target = cents(g.targetCents)
      const { progressBp, reached } = fundProgress({ goalCents: target, balanceCents: saved })
      return {
        id: g.id,
        savedCents: saved,
        targetCents: target,
        remainingCents: reached ? ZERO_CENTS : subCents(target, saved),
        progressBp,
        targetMet: reached,
        empty: saved <= 0,
        hours:
          g.unitCostCents === null || saved < 0
            ? null
            : { saved: timeEquivalent(saved, g.unitCostCents).hours, target: timeEquivalent(target, g.unitCostCents).hours },
      }
    }),
  }
}
