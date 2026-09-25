/**
 * The active goals as packages/core's goal functions read them (F33, F34,
 * F45): the shared goals, in the owner's order with the main goal first,
 * joined to the funds read for what each has saved and which fund it is on.
 *
 * Renaming and joining only: what a goal has saved is `goalSavedCents`, the
 * figure Savings shows, and every forecast, lever and milestone is core's.
 */
import { isoDate, type DigestGoal, type ForecastGoal } from '@budget/core'
import { goalSavedCents, type FundsState } from '../funds.js'
import type { ListedGoalRow } from '../ledger.js'

export interface CoreGoal extends DigestGoal, ForecastGoal {
  /** What its hours are of, as the owner typed it; null for a goal in dollars. */
  readonly unitLabel: string | null
}

/**
 * Null while the funds load, so no milestone or date is worked out from a
 * typed amount the fund's transfers are about to replace. When the funds
 * cannot be read, every goal reads as on no fund: nothing moved in is
 * counted, and the screen says why rather than show a pace.
 */
export function goalsForCore(goals: readonly ListedGoalRow[], funds: FundsState): readonly CoreGoal[] | null {
  if (funds.status === 'loading') return null
  return goals
    .filter((g) => g.status === 'active')
    .map((g) => {
      const fund = funds.status === 'ready' ? funds.funds.funds.find((f) => f.figures?.goalId === g.id) : undefined
      const typedOn = funds.status === 'ready' ? funds.goals.find((r) => r.id === g.id)?.balance_as_of : undefined
      const on = fund !== undefined && typedOn !== undefined && typedOn !== null ? { fund, typedOn } : null
      return {
        id: g.id,
        name: g.name,
        targetCents: g.target_cents,
        savedCents: goalSavedCents(g, funds),
        unitCostCents: g.unit_cost_cents,
        unitLabel: g.unit_label,
        targetDate: g.target_date === null ? null : isoDate(g.target_date),
        fundCategoryId: on === null ? null : on.fund.categoryId,
        typedOn: on === null ? null : isoDate(on.typedOn),
      }
    })
}
