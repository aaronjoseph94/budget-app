/**
 * A savings goal's milestones, for the Coach's cheer (F33; plan slice A08).
 *
 * NOT workbook-derived. A goal with a cost an hour has one every 5 whole
 * hours, as its progress is counted in hours (F45); any other goal one
 * every tenth of its target. A milestone is news while it is recent: passed
 * since the last complete week began, so it stays up for one to two weeks
 * and then gives way.
 */
import { type IsoDate, addDays, cents, sumCents } from '@budget/money-primitives'
import { timeEquivalent } from './goal.js'
import type { PeriodEntry } from './period-sheet.js'
import { weekBounds } from './week.js'

export interface GoalMilestonesInput {
  readonly asOf: IsoDate
  /** Ledger rows, signed as the ledger is (D3); only the goal's fund's are read. */
  readonly entries: readonly PeriodEntry[]
  readonly goal: {
    readonly targetCents: number
    /** Saved now, as goalForecast takes it. */
    readonly savedCents: number
    readonly unitCostCents: number | null
    /** The Savings-list fund it is on; null on no fund, where nothing moves in. */
    readonly fundCategoryId: string | null
    /** The day its balance was typed (0013's balance_as_of): a move on or before it is in that amount. */
    readonly typedOn: IsoDate | null
  }
}

export interface GoalMilestones {
  /** Hours for a goal with a cost an hour; otherwise a share of the target, in basis points. */
  readonly unit: 'hours' | 'share'
  /** The highest milestone passed since `since`: whole hours, or basis points of the target. Null when none. */
  readonly passed: number | null
  /** The last complete week's Monday. */
  readonly since: IsoDate
}

const HOURS_A_STEP = 5
const TENTHS = 10

export function goalMilestones(input: GoalMilestonesInput): GoalMilestones {
  const { goal } = input
  const since = addDays(weekBounds(input.asOf).start, -7)
  const eve = addDays(since, -1)
  const after = goal.typedOn !== null && goal.typedOn > eve ? goal.typedOn : eve
  const moved = sumCents(
    input.entries
      .filter((e) => goal.fundCategoryId !== null && e.categoryId === goal.fundCategoryId && e.postedOn > after && e.postedOn <= input.asOf)
      .map((e) => cents(e.amountCents)),
  )
  const now = cents(goal.savedCents)
  // Money moved in is a negative row (D3), so saved then is now plus the rows.
  const then = cents(now + moved)
  const rate = goal.unitCostCents
  const step = (saved: number): number => {
    if (saved <= 0) return 0
    if (rate !== null) return Math.floor(timeEquivalent({ amountCents: saved, unitCostPerHourCents: rate }).hours / HOURS_A_STEP)
    return Math.min(TENTHS, Math.floor((saved * TENTHS) / goal.targetCents))
  }
  const reached = step(now)
  const passed = reached > step(then) ? (rate !== null ? reached * HOURS_A_STEP : reached * (10_000 / TENTHS)) : null
  return { unit: rate !== null ? 'hours' : 'share', passed, since }
}
