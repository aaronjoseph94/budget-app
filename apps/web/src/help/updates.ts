/**
 * Which one-time updates are in the owner's database (plan §8.2, A06).
 *
 * The owner pastes each migration into Supabase by hand, so the app cannot
 * know which are in without asking. Each update is proven by what it adds:
 * a table, a column or a function. A table or column is read with a limit
 * of none, so nothing comes back; a function is called with the nil id,
 * which each of these refuses as "not found" (42501) before it writes a
 * thing. So a check never changes anything, and asking twice is safe.
 *
 * What says "not there" is PostgREST's own code: PGRST205 for a table it
 * does not know (42P01 from an older PostgREST), 42703 for a column, and
 * PGRST202 for a function (42883 from Postgres). Any other failure, such
 * as a dropped connection, is "could not check", never "missing": telling
 * the owner to paste something already in would be refused, and worry them.
 */
import type { SupabaseClient } from '../supabase.js'

type Check =
  | { readonly kind: 'table'; readonly table: string }
  | { readonly kind: 'column'; readonly table: string; readonly column: string }
  | { readonly kind: 'function'; readonly name: string; readonly args: Readonly<Record<string, unknown>> }

export interface Update {
  readonly file: string
  /** What it adds, in the owner's words. */
  readonly adds: string
  readonly checks: readonly Check[]
}

const NIL = '00000000-0000-0000-0000-000000000000'

/** 0005 to 0015, each with what it adds; 0016 on join as their slices land. */
export const UPDATES: readonly Update[] = [
  { file: '0005_category_kinds.sql', adds: 'Which list each category is on', checks: [{ kind: 'column', table: 'categories', column: 'kind' }] },
  {
    file: '0006_recategorise.sql',
    adds: 'Moving a saved charge to another category',
    checks: [{ kind: 'function', name: 'recategorise_transaction', args: { p_transaction: NIL, p_category: NIL, p_learn: false } }],
  },
  { file: '0007_statement_periods.sql', adds: 'The dates each statement covered', checks: [{ kind: 'column', table: 'ingest_batches', column: 'period_start' }] },
  { file: '0008_category_budgets.sql', adds: 'Budgets and goals typed on the Month', checks: [{ kind: 'table', table: 'category_budgets' }] },
  { file: '0009_category_plans.sql', adds: 'Each bill’s monthly amount and day paid', checks: [{ kind: 'table', table: 'category_plans' }] },
  { file: '0010_month_balances.sql', adds: 'Each month’s starting balance', checks: [{ kind: 'table', table: 'month_balances' }] },
  { file: '0011_pay_schedules.sql', adds: 'When each income pays', checks: [{ kind: 'table', table: 'pay_schedules' }] },
  {
    file: '0012_dismiss_unreadable_lines.sql',
    adds: 'Dismissing a line the reader could not read',
    checks: [{ kind: 'function', name: 'dismiss_unreadable_line', args: { p_line: NIL } }],
  },
  { file: '0013_savings_funds.sql', adds: 'Savings funds and their balances', checks: [{ kind: 'column', table: 'savings_goals', column: 'category_id' }] },
  {
    file: '0014_debts.sql',
    adds: 'Debts and extra payments',
    checks: [
      { kind: 'table', table: 'debts' },
      { kind: 'table', table: 'debt_extra_payments' },
    ],
  },
  {
    file: '0015_savings_goals_order.sql',
    adds: 'Your main savings goal, their order, and pausing or finishing one',
    checks: [{ kind: 'column', table: 'savings_goals', column: 'sort_order' }],
  },
]

/** What 0005's absence means: start where HANDOFF's list starts. */
export const FIRST_FILE = '0003_save_import_atomically.sql'

export type UpdateState = 'in' | 'missing' | 'unknown'

export interface Checked {
  readonly update: Update
  readonly state: UpdateState
}

const MISSING: Readonly<Record<Check['kind'], ReadonlySet<string>>> = {
  table: new Set(['PGRST205', '42P01']),
  column: new Set(['42703']),
  function: new Set(['PGRST202', '42883']),
}

async function probe(supabase: SupabaseClient, check: Check): Promise<UpdateState> {
  const { error } =
    check.kind === 'function'
      ? await supabase.rpc(check.name, check.args)
      : await supabase.from(check.table).select(check.kind === 'column' ? check.column : '*').limit(0)
  if (error === null) return 'in'
  const code = typeof error.code === 'string' ? error.code : ''
  if (MISSING[check.kind].has(code)) return 'missing'
  // The function ran, and refused the nil id: it is there.
  return check.kind === 'function' && code === '42501' ? 'in' : 'unknown'
}

/** Every update's state, all asked at once. */
export async function checkUpdates(supabase: SupabaseClient): Promise<Checked[]> {
  return Promise.all(
    UPDATES.map(async (update) => {
      const states = await Promise.all(update.checks.map((c) => probe(supabase, c)))
      const state: UpdateState = states.includes('missing') ? 'missing' : states.includes('unknown') ? 'unknown' : 'in'
      return { update, state }
    }),
  )
}

export type NextStep =
  | { readonly kind: 'done' }
  | { readonly kind: 'paste'; readonly file: string; readonly fromStart: boolean }
  | { readonly kind: 'unknown' }

/**
 * The one thing to do next: the first update not in, in number order,
 * because each builds on the ones before. With 0005 missing that is
 * HANDOFF's first file, 0003, since 0003 and 0004 cannot be told apart
 * without writing; one already in is refused, which does no harm.
 */
export function nextStep(checked: readonly Checked[]): NextStep {
  const first = checked.find((c) => c.state === 'missing')
  if (first !== undefined) {
    const fromStart = first.update === UPDATES[0]
    return { kind: 'paste', file: fromStart ? FIRST_FILE : first.update.file, fromStart }
  }
  return checked.some((c) => c.state === 'unknown') ? { kind: 'unknown' } : { kind: 'done' }
}
