/**
 * Review's Suggested changes (ADR 0013, PROPOSALS.md §6): what an AI app
 * suggested, waiting for the owner, and what each one's target is now.
 *
 * A stored suggestion is an AI app's output at rest, so each row is parsed
 * with StoredSuggestionSchema; one that does not parse is shown as one
 * that cannot be read. Its stored "before" is never trusted: each card's
 * "from" is the current value, worked out from freshly read rows with the
 * same core function the screen uses (resolveBudgets, resolvePlans) or
 * read from the stored column. A card whose value moved since it was
 * suggested is stale and can only be dismissed. Nothing here adds, takes
 * away or compares amounts beyond "is it the same".
 */
import { isoDate, monthBounds, resolveBudgets, resolvePlans } from '@budget/core'
import { StoredSuggestionSchema, type StoredSuggestion } from '@budget/schema'
import { listBudgetHistory, listFunds, listPlanHistory, listRules, ReadRefused, type BudgetRow, type Category, type FundRow, type PlanRow } from '../ledger.js'
import { describeWriteFailure } from '../format.js'
import { budgetsForCore, plansForCore } from '../sheet-input.js'
import type { SupabaseClient } from '../supabase.js'

/** One waiting row: its suggestion, or null when it cannot be read, and the AI app that made it. */
export interface Waiting {
  readonly id: string
  readonly clientId: string | null
  readonly suggestion: StoredSuggestion | null
}

/** A missing table: 0039 not pasted yet, so nothing waits. */
const NOT_YET: ReadonlySet<string> = new Set(['PGRST205', '42P01'])

/** The suggestions waiting for the owner, oldest first; none before 0039 is in. */
export async function listWaiting(supabase: SupabaseClient): Promise<readonly Waiting[]> {
  const { data, error } = await supabase
    .from('ai_app_proposals')
    .select('id, kind, client_id, target, after, before, reason, created_at, expires_at')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(100)
  if (error !== null) {
    if (NOT_YET.has(error.code)) return []
    throw new ReadRefused(describeWriteFailure(error), error.code)
  }
  return (data as readonly Readonly<Record<string, unknown>>[]).map((row) => {
    const parsed = StoredSuggestionSchema.safeParse(row)
    return {
      id: String(row['id']),
      clientId: typeof row['client_id'] === 'string' ? row['client_id'] : null,
      suggestion: parsed.success ? parsed.data : null,
    }
  })
}

/** How many suggestions wait, for the sidebar and the tab bar: 0 before 0039 is in. */
export async function countWaiting(supabase: SupabaseClient): Promise<number> {
  const { error, count } = await supabase
    .from('ai_app_proposals')
    .select('id', { count: 'exact' })
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .limit(1)
  if (error !== null) {
    if (NOT_YET.has(error.code)) return 0
    throw new ReadRefused(describeWriteFailure(error), error.code)
  }
  if (count === null) throw new Error('The suggested changes could not be counted. Try again.')
  return count
}

/** A charge a suggestion names, as the Month's Move reads it, with its shop as a learned rule keys it. */
export interface Charge {
  readonly id: string
  readonly posted_on: string
  readonly amount_cents: number
  readonly merchant_raw: string
  readonly merchant: string
  readonly category_id: string
  readonly source: string
}

/** The rows the cards' current values come from, read fresh. */
export interface Sources {
  readonly categories: readonly Category[]
  readonly budgets: readonly BudgetRow[]
  readonly plans: readonly PlanRow[]
  readonly funds: readonly FundRow[]
  readonly charges: readonly Charge[]
  readonly rules: ReadonlyMap<string, string>
}

/** The latest month the suggestions name, or null when none names one. */
function latest(suggestions: readonly StoredSuggestion[]): string | null {
  const months = suggestions.flatMap((s) => (s.kind === 'set_budget' || s.kind === 'set_bill' ? [s.target.month] : []))
  return months.length === 0 ? null : months.reduce((a, b) => (a > b ? a : b))
}

/** Only what the waiting kinds need, each with the screens' own reads. */
export async function readSources(supabase: SupabaseClient, categories: readonly Category[], suggestions: readonly StoredSuggestion[]): Promise<Sources> {
  const has = (kinds: readonly StoredSuggestion['kind'][]) => suggestions.some((s) => kinds.includes(s.kind))
  const budgetMonth = latest(suggestions.filter((s) => s.kind === 'set_budget'))
  // A budget on Bills, Debts or Subscriptions reads its monthly amount too (F51).
  const onPlanList = (id: string) => RECURRING.has(categories.find((c) => c.id === id)?.kind ?? '')
  const planMonth = latest(suggestions.filter((s) => s.kind === 'set_bill' || (s.kind === 'set_budget' && onPlanList(s.target.category_id))))
  const ids = [...new Set(suggestions.flatMap((s) => (s.kind === 'recategorise' || s.kind === 'learn_shop' ? [s.target.transaction_id] : [])))]
  const [budgets, plans, funds, charges, rules] = await Promise.all([
    budgetMonth === null ? [] : listBudgetHistory(supabase, budgetMonth),
    planMonth === null ? [] : listPlanHistory(supabase, planMonth, 'read'),
    has(['set_goal', 'move_category']) ? listFunds(supabase) : [],
    ids.length === 0 ? [] : readCharges(supabase, ids),
    has(['learn_shop']) ? listRules(supabase) : new Map<string, string>(),
  ])
  return { categories, budgets, plans, funds, charges, rules }
}

async function readCharges(supabase: SupabaseClient, ids: readonly string[]): Promise<readonly Charge[]> {
  const { data, error } = await supabase.from('transactions').select('id, posted_on, amount_cents, merchant_raw, merchant, category_id, source').in('id', [...ids])
  if (error !== null) throw new ReadRefused(describeWriteFailure(error), error.code)
  return (data as Charge[]).map((c) => ({ ...c, amount_cents: Number(c.amount_cents) }))
}

/**
 * What a suggestion's target is now, shaped as its stored before. Gone
 * when it no longer exists ('removed'), or when its category is now on a
 * list the screens offer no such value on ('moved'), as 0039 refuses one
 * suggested there (wrong_list): Apply's rules are the screens'.
 */
export type Now =
  | {
      readonly value: Readonly<Record<string, unknown>>
      /** From a month on: that month's own "just this month" value, which Apply replaces too. */
      readonly also?: Readonly<Record<string, unknown>>
    }
  | { readonly gone: 'removed' | 'moved' }

const GONE: Now = { gone: 'removed' }
const MOVED: Now = { gone: 'moved' }
/** The lists with a monthly amount, as Setup's three cards and 0009. */
const RECURRING: ReadonlySet<string> = new Set(['bill', 'debt', 'subscription'])

export function currentOf(s: StoredSuggestion, sources: Sources): Now {
  const category = (id: string) => sources.categories.find((c) => c.id === id)
  switch (s.kind) {
    case 'set_budget': {
      const c = category(s.target.category_id)
      if (c === undefined) return GONE
      if (c.kind === 'transfer') return MOVED
      // From a month on, as the server worked out its "from": the onward
      // rows' value, with that month's own value beside it (D12).
      const onward = s.target.applies === 'onward'
      const rows = budgetsForCore(sources.budgets)
      const history = onward ? rows.filter((b) => b.applies === 'onward') : rows
      const now = resolveBudgets({ asOf: isoDate(s.target.month), history }).budgets.find((b) => b.categoryId === s.target.category_id)
      const value = { cents: now === undefined ? null : now.budgetCents }
      const own = onward ? sources.budgets.find((b) => b.category_id === c.id && b.month === s.target.month && b.applies === 'only') : undefined
      return own === undefined ? { value } : { value, also: { cents: own.budget_cents } }
    }
    case 'set_bill': {
      const c = category(s.target.category_id)
      if (c === undefined) return GONE
      if (!RECURRING.has(c.kind)) return MOVED
      const now = resolvePlans({ asOf: isoDate(s.target.month), history: plansForCore(sources.plans) }).plans.find((p) => p.categoryId === s.target.category_id)
      return { value: { cents: now === undefined ? null : now.plannedCents, due_day: now === undefined ? null : now.dueDay } }
    }
    case 'set_weekly_limit': {
      const c = category(s.target.category_id)
      return c === undefined ? GONE : c.kind === 'transfer' ? MOVED : { value: { cents: c.weekly_budget_cents } }
    }
    case 'set_goal': {
      const goal = sources.funds.find((g) => g.id === s.target.goal_id)
      return goal === undefined ? GONE : { value: { target_cents: goal.target_cents, target_date: goal.target_date } }
    }
    case 'rename_category': {
      const c = category(s.target.category_id)
      return c === undefined ? GONE : { value: { name: c.name } }
    }
    case 'move_category': {
      const c = category(s.target.category_id)
      return c === undefined ? GONE : { value: { list: c.kind } }
    }
    case 'add_category': {
      const c = sources.categories.find((k) => k.name === s.target.name)
      return { value: c === undefined ? { exists: false } : { name: c.name, list: c.kind } }
    }
    case 'recategorise':
    case 'learn_shop': {
      const charge = sources.charges.find((t) => t.id === s.target.transaction_id)
      if (charge === undefined) return GONE
      if (s.kind === 'recategorise') return { value: { category_id: charge.category_id } }
      const rule = sources.rules.get(charge.merchant)
      return { value: { category_id: charge.category_id, rule_category_id: rule === undefined ? null : rule } }
    }
  }
}

/** Two values of one shape, key by key. */
const same = (a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(b).every((k) => a[k] === b[k])

/**
 * ready: Apply and Dismiss. stale: its target changed since it was
 * suggested, or is gone, or its month has passed; Dismiss only. already:
 * it is already so; Clear, which dismisses it. unreadable: Dismiss only.
 */
export type CardState = 'ready' | 'stale' | 'already' | 'unreadable'

/** A budget or monthly amount for a month before today's: Setup never writes one. */
const monthPassed = (s: StoredSuggestion, today: string) =>
  (s.kind === 'set_budget' || s.kind === 'set_bill') && s.target.month < monthBounds(isoDate(today)).start

export function stateOf(s: StoredSuggestion | null, now: Now | null, today: string): CardState {
  if (s === null || now === null) return 'unreadable'
  if ('gone' in now || monthPassed(s, today)) return 'stale'
  if (s.kind === 'learn_shop') {
    const to = s.after.category_id
    if (now.value['category_id'] === to && now.value['rule_category_id'] === to) return 'already'
  } else if (same(now.value, s.after) && (now.also === undefined || same(now.also, s.after))) {
    return 'already'
  }
  return same(now.value, s.before) ? 'ready' : 'stale'
}

/** Why a card is stale when not because its value moved, in words; null otherwise. */
export function staleWhy(s: StoredSuggestion | null, now: Now | null, today: string): string | null {
  if (s === null || now === null) return null
  if (monthPassed(s, today)) return 'Its month has passed, so it can no longer be applied.'
  if (!('gone' in now)) return null
  return now.gone === 'moved' ? 'Its category moved to another list since it was suggested.' : 'Changed since it was suggested, and no longer there.'
}

/**
 * A bill's, debt's or subscription's monthly amount in effect in a month,
 * which stands as its budget where none is typed (F51); null on another
 * list, or with none in effect.
 */
export function plannedStanding(sources: Sources, categoryId: string, month: string): number | null {
  if (!RECURRING.has(sources.categories.find((c) => c.id === categoryId)?.kind ?? '')) return null
  const plan = resolvePlans({ asOf: isoDate(month), history: plansForCore(sources.plans) }).plans.find((p) => p.categoryId === categoryId)
  return plan === undefined ? null : plan.plannedCents
}
