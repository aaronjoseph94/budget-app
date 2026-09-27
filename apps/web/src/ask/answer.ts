/**
 * Ask's answer: a reading of the question handed to core's answerQuery
 * with the owner's records (plan A24, F48). The rows are the year the Coach
 * reads (useCoachRead), renamed for core as every screen renames them;
 * nothing is added up here.
 */
import { answerQuery, isoDate, type Answer, type AskQuery, type DebtPlanInput } from '@budget/core'
import { debtsForCore } from '../debts.js'
import { listDebtExtras, listDebts, needsOneTimeUpdate, type Category } from '../ledger.js'
import { budgetsForCore, plansForCore, shopEntriesForCore, weekCategoriesForCore } from '../sheet-input.js'
import type { SupabaseClient } from '../supabase.js'
import { forecastOf, historyOf, type DigestRows } from '../coach/facts.js'
import type { CoreGoal } from '../coach/goals.js'

export interface AnswerInputs {
  readonly read: DigestRows
  readonly categories: readonly Category[]
  /** The active goals, the main goal first. */
  readonly goals: readonly CoreGoal[]
  /** Null when they were not read, or did not load. */
  readonly debts: DebtPlanInput | null
  readonly notSubscriptions: readonly string[]
}

/** Core's answer to one question. Throws where the engine refuses a row, for the screen to say so. */
export function answerOf(inputs: AnswerInputs, query: AskQuery): Answer {
  const { read } = inputs
  return answerQuery({
    asOf: isoDate(read.asOf),
    historyStart: historyOf(read),
    readFrom: isoDate(read.readFrom),
    categories: weekCategoriesForCore(inputs.categories),
    budgetHistory: budgetsForCore(read.budgets),
    planHistory: plansForCore(read.plans),
    entries: shopEntriesForCore(read.rows),
    query,
    forecast: read.forecast?.status === 'ready' ? forecastOf(read.forecast) : null,
    goals: inputs.goals.map((g) => ({
      name: g.name,
      targetCents: g.targetCents,
      savedCents: g.savedCents,
      targetDate: g.targetDate,
      fundCategoryId: g.fundCategoryId,
      unitCostCents: g.unitCostCents,
    })),
    debts: inputs.debts,
    notSubscriptions: inputs.notSubscriptions,
  })
}

/** The payoff plan's debts, read only for a question about them; or why they did not load. */
export async function readDebts(supabase: SupabaseClient): Promise<DebtPlanInput | 'missing_update' | 'failed'> {
  try {
    const [rows, extras] = await Promise.all([listDebts(supabase), listDebtExtras(supabase)])
    return debtsForCore(rows, extras)
  } catch (cause) {
    return needsOneTimeUpdate(cause) ? 'missing_update' : 'failed'
  }
}
