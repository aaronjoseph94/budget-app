/**
 * The savings goals' own writes (G1): their places, their states, adding one
 * with its fund, making a goal on no fund a fund's, and removing one. Kept
 * apart from ledger.ts, which the first load carries, because only Savings
 * writes these, and Savings loads when it is opened.
 *
 * Nothing here computes: every place comes from core (moveGoal, goalAtEnd)
 * and every amount is as typed.
 */
import { ensureCategory, linkFund, type NewCategory } from './ledger.js'
import { describeFundFailure, describeWriteFailure, type WriteError } from './format.js'
import type { SupabaseClient } from './supabase.js'

/**
 * Why a goal could not be moved, made main, paused, resumed or marked
 * reached (0015). Before 0015 is pasted a write naming its columns is
 * PGRST204 (42703 from Postgres); the screen offers none of these then, so
 * it was pasted and taken out, or another device is ahead. 23514 is 0015's
 * CHECK on the reached day, which the app always writes with the state, so
 * the goal changed elsewhere first.
 */
const GOAL_FAILURES: Readonly<Record<string, string>> = {
  PGRST204: 'Choosing your main goal, moving, pausing and reaching goals need a one-time update. Nothing was saved.',
  '42703': 'Choosing your main goal, moving, pausing and reaching goals need a one-time update. Nothing was saved.',
  '23514': 'That goal changed on another device. It now shows as it is stored. Nothing was saved.',
}

function describeGoalFailure(error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = GOAL_FAILURES[code]
  return body === undefined ? describeWriteFailure(error) : `${body} (code ${code})`
}

/**
 * Write goals' places, as core's moveGoal worked them out (0015). One goal
 * at a time, as Setup writes a list's order: a failure part-way leaves a
 * valid order that is simply not the one asked for, and the screen reloads
 * to show what is stored.
 */
export async function setGoalPlaces(
  supabase: SupabaseClient,
  changes: readonly { readonly id: string; readonly sortOrder: number }[],
): Promise<void> {
  for (const change of changes) {
    const { error } = await supabase.from('savings_goals').update({ sort_order: change.sortOrder }).eq('id', change.id)
    if (error !== null) throw new Error(describeGoalFailure(error))
  }
}

/** A goal paused, reached on a day, or back among the active goals at a place (F45). */
export type GoalStateChange =
  | { readonly status: 'paused' }
  | { readonly status: 'reached'; readonly on: string }
  | { readonly status: 'active'; readonly sortOrder: number }

/**
 * Pause, resume or mark a goal reached (0015). The reached day is written
 * with the state and cleared with it, as 0015's CHECK requires; a resumed
 * goal takes the place core gave it, after every other.
 */
export async function setGoalState(supabase: SupabaseClient, goalId: string, change: GoalStateChange): Promise<void> {
  const row =
    change.status === 'reached'
      ? { status: change.status, reached_on: change.on }
      : change.status === 'paused'
        ? { status: change.status, reached_on: null }
        : { status: change.status, reached_on: null, sort_order: change.sortOrder }
  const { error } = await supabase.from('savings_goals').update(row).eq('id', goalId)
  if (error !== null) throw new Error(describeGoalFailure(error))
}

/**
 * Remove a goal: the screen offers it only with nothing saved (F45). Its
 * fund's category stays on the Savings list, with every charge under it.
 */
export async function removeGoal(supabase: SupabaseClient, goalId: string): Promise<void> {
  const { error } = await supabase.from('savings_goals').delete().eq('id', goalId)
  if (error !== null) throw new Error(describeGoalFailure(error))
}

/**
 * Make a goal on no fund a fund's goal (G1): the Savings-list category of its
 * name, made at the bottom of the list when there is none, then linked as
 * linkFund links one, so money moved in after today adds to it (D16).
 */
export async function makeGoalAFund(
  supabase: SupabaseClient,
  userId: string,
  fund: NewCategory,
  link: { readonly goalId: string; readonly asOf: string },
): Promise<void> {
  const category = await ensureCategory(supabase, userId, fund)
  await linkFund(supabase, { goalId: link.goalId, categoryId: category.id, asOf: link.asOf })
}

/** A goal as the Add a goal sheet types it (G1). */
export interface NewGoal {
  readonly name: string
  readonly targetCents: number
  readonly savedCents: number
  readonly targetDate: string | null
  readonly startDate: string | null
  readonly unitCostCents: number | null
  readonly unitLabel: string | null
  /** Today: the day what is saved is true, at its end (D16). */
  readonly asOf: string
  /** After every other goal (F45); null before 0015, which has no place to write. */
  readonly sortOrder: number | null
}

/**
 * Add a goal with its fund (G1): the Savings-list category of that name,
 * made at the bottom of the list when there is none, as Setup adds a row,
 * then the goal linked to it with what is saved true as of today, so money
 * moved in later adds to it (D16). Two writes, not one: a fund made and its
 * goal refused leaves an empty Savings row, which trying again links.
 */
export async function addGoal(supabase: SupabaseClient, userId: string, fund: NewCategory, goal: NewGoal): Promise<void> {
  const category = await ensureCategory(supabase, userId, fund)
  const { error } = await supabase.from('savings_goals').insert({
    user_id: userId,
    name: goal.name,
    target_cents: goal.targetCents,
    saved_cents: goal.savedCents,
    target_date: goal.targetDate,
    start_date: goal.startDate,
    unit_cost_cents: goal.unitCostCents,
    unit_label: goal.unitLabel,
    category_id: category.id,
    balance_as_of: goal.asOf,
    ...(goal.sortOrder === null ? {} : { sort_order: goal.sortOrder }),
  })
  if (error !== null) throw new Error(describeFundFailure('save', error))
}
