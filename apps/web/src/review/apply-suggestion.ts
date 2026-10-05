/**
 * Apply and Dismiss a suggested change (ADR 0013, PROPOSALS.md §6).
 *
 * Apply is the screen's own write, then the mark: read again, check the
 * target is still as the card showed it, make the change with the same
 * ledger.ts function, with the same arguments, the screen that owns it
 * uses, and only then mark the suggestion applied (0039's
 * decide_suggestion, which an AI app's token cannot call). A write the
 * database refuses leaves the suggestion waiting, in the screen's own
 * words. A mark lost after a good write leaves a card that reads
 * "Already so" next time; every write here is idempotent, so nothing is
 * ever applied twice.
 */
import type { StoredSuggestion } from '@budget/schema'
import { describeWriteFailure } from '../format.js'
import {
  ReadRefused,
  ensureCategory,
  listCategories,
  moveCategory,
  recategoriseTransaction,
  renameCategory,
  saveFund,
  setBudget,
  setPlan,
  setWeeklyBudget,
  type Category,
} from '../ledger.js'
import { atEndOf } from '../lists.js'
import type { SupabaseClient } from '../supabase.js'
import { currentOf, readSources, stateOf, type Sources } from './suggested-changes.js'

/** Mark a waiting suggestion applied or dismissed; false when it was no longer waiting. */
export async function decideSuggestion(supabase: SupabaseClient, id: string, outcome: 'applied' | 'dismissed'): Promise<boolean> {
  const { data, error } = await supabase.rpc('decide_suggestion', { p_id: id, p_outcome: outcome })
  if (error !== null) throw new ReadRefused(describeWriteFailure(error), error.code)
  return data === true
}

/** Dismiss: the suggestion goes, and nothing else changes. */
export const dismissSuggestion = (supabase: SupabaseClient, id: string) => decideSuggestion(supabase, id, 'dismissed')

/** applied: made and marked. stale: changed since it was suggested, so nothing was written. already: it is already so. */
export type Applied = 'applied' | 'stale' | 'already'

/** The write the owning screen makes, as it makes it. Throws its refusal in its own words. */
async function write(supabase: SupabaseClient, userId: string, s: StoredSuggestion, sources: Sources, categories: readonly Category[]): Promise<void> {
  switch (s.kind) {
    case 'set_budget': {
      const { category_id: categoryId, month, applies } = s.target
      // As the Month's editor: a month's own "just this month" value is given the same in the same write (D12).
      const replacesOnly = applies === 'onward' && sources.budgets.some((b) => b.category_id === categoryId && b.month === month && b.applies === 'only')
      return setBudget(supabase, { userId, categoryId, month, applies, budgetCents: s.after.cents, replacesOnly })
    }
    case 'set_weekly_limit':
      return setWeeklyBudget(supabase, s.target.category_id, s.after.cents)
    case 'set_bill':
      // As Setup: both columns in every write.
      return setPlan(supabase, { userId, categoryId: s.target.category_id, month: s.target.month, plannedCents: s.after.cents, dueDay: s.after.due_day })
    case 'set_goal': {
      const goal = sources.funds.find((g) => g.id === s.target.goal_id)
      if (goal === undefined) throw new Error('That savings goal is no longer there. Nothing was changed.')
      // As the Savings screen's editor with the balance left alone: the typed balance stays (backend-c1-01).
      return saveFund(
        supabase,
        { userId, categoryId: goal.category_id, name: goal.name, goalId: goal.id },
        { goalCents: s.after.target_cents, saved: null, startDate: goal.start_date, goalDate: s.after.target_date, unitCostCents: goal.unit_cost_cents, unitLabel: goal.unit_label },
      )
    }
    case 'rename_category':
      return renameCategory(supabase, s.target.category_id, s.after.name)
    case 'add_category':
      await ensureCategory(supabase, userId, atEndOf(categories, s.after.name, s.after.list))
      return
    case 'move_category': {
      const category = categories.find((c) => c.id === s.target.category_id)
      if (category === undefined) throw new Error('That category is no longer there. Nothing was changed.')
      return moveCategory(supabase, category.id, { kind: s.after.list, sortOrder: atEndOf(categories, category.name, s.after.list).sortOrder })
    }
    case 'recategorise':
    case 'learn_shop':
      // The Month's Move, with "Always file" off or on.
      return recategoriseTransaction(supabase, { transactionId: s.target.transaction_id, categoryId: s.after.category_id, learn: s.kind === 'learn_shop' })
  }
}

/** Read again, check, write, mark. */
export async function applySuggestion(supabase: SupabaseClient, userId: string, s: StoredSuggestion): Promise<Applied> {
  const categories = await listCategories(supabase)
  const sources = await readSources(supabase, categories, [s])
  const state = stateOf(s, currentOf(s, sources))
  if (state === 'already' || state === 'stale') return state
  await write(supabase, userId, s, sources, categories)
  await decideSuggestion(supabase, s.id, 'applied')
  return 'applied'
}
