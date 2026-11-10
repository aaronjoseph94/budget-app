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
import { AI_HELPER_VERSION, READ_RECEIPT_VERSION } from '@budget/schema'
import { askAi } from '../ai/client.js'
import { readEnv } from '../env.js'
import type { SupabaseClient } from '../supabase.js'

type Check =
  | { readonly kind: 'table'; readonly table: string }
  | { readonly kind: 'column'; readonly table: string; readonly column: string }
  | { readonly kind: 'function'; readonly name: string; readonly args: Readonly<Record<string, unknown>> }
  /** The AI helper answers `ping` once it is deployed; Supabase answers 404 until then. */
  | { readonly kind: 'helper' }
  /**
   * read-receipt: in when deleted (Supabase's 404) or when it answers GET
   * with a version at least READ_RECEIPT_VERSION; an older copy answers 405
   * and relies on the gateway's JWT switch alone.
   */
  | { readonly kind: 'read_receipt' }
  /** Allow new users to sign up, off: from the settings Supabase's auth server publishes (backend-b-06). */
  | { readonly kind: 'signups' }
  /**
   * One of the review fixes (0021 to 0029, and 0038): each re-creates
   * schema_level() (0021) to answer its own number, and is in when that
   * answer is at least `level`.
   */
  | { readonly kind: 'schema'; readonly level: number }
  /**
   * One of 0030 to 0037: written for the AI apps feature, since removed
   * (ADR 0016), and still needed because 0038 refuses to run without 0037.
   * In when ai_app_updates_in() (0035) answers at least `level`, or, before
   * 0035, the number each left in ai_app_update_level().
   */
  | { readonly kind: 'chain'; readonly level: number }

/** The AI helper's source, as One-time updates names it and /setup/ serves it (ADR 0007). */
export const HELPER_FILE = 'ai-function.ts'

/**
 * read-receipt's source, offered beside the AI helper to paste again or
 * delete: the app reads receipts through the helper, and a copy from before
 * 2026-09-30 lets anyone holding the app's public key spend the Gemini key.
 */
export const READ_RECEIPT_FILE = 'read-receipt-function.ts'

/**
 * Turning off Allow new users to sign up: a setting, first on the list.
 * While it is on, anyone who finds the site can make an account with the
 * public key in the page, and any account can spend the owner's AI keys
 * (backend-b-06, security-a-03).
 */
export const SIGNUPS_OFF = 'signups-off'

export interface Update {
  readonly file: string
  /** What the list calls a step that is a setting, not a file. */
  readonly name?: string
  /** What it adds, in the owner's words. */
  readonly adds: string
  readonly checks: readonly Check[]
}

const NIL = '00000000-0000-0000-0000-000000000000'

/** 0030 to 0037's files, in the order they are pasted. */
const CHAIN_FILES = {
  30: '0030_ai_app_gate_live_session.sql',
  31: '0031_ai_app_hash_own_kind.sql',
  32: '0032_ai_rows_teach_no_rule.sql',
  33: '0033_ai_search_masked.sql',
  34: '0034_ai_words_visible.sql',
  36: '0036_ai_search_as_shown.sql',
  37: '0037_ai_rows_before_the_fixes.sql',
} as const

/**
 * What a step for the removed AI apps feature says (ADR 0016): it is listed
 * only because a later update needs it.
 */
const KEPT_FOR_LATER = 'Needed by the updates after it. Changes nothing you see'

/** Sign-ups off, 0005 to 0041 and the AI helper and read-receipt, each with what it adds. */
export const UPDATES: readonly Update[] = [
  // First: it needs nothing, and it is what keeps strangers out.
  { file: SIGNUPS_OFF, name: 'Sign-ups off', adds: 'Stops anyone who finds the site making an account', checks: [{ kind: 'signups' }] },
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
  {
    // ai_key_status is the one 0016 function the browser may call; it only reads.
    file: '0016_ai_foundation.sql',
    adds: 'Where AI keeps your settings, your keys and today’s use',
    checks: [{ kind: 'function', name: 'ai_key_status', args: {} }],
  },
  {
    file: '0017_coach_memory.sql',
    adds: 'Where the Coach keeps the AI’s words, what you dismissed and your check-in answers',
    checks: [
      { kind: 'table', table: 'ai_notes' },
      { kind: 'table', table: 'insight_dismissals' },
      { kind: 'table', table: 'coach_answers' },
    ],
  },
  {
    // Clearing the nil id's suggestion finds no row, changes nothing and answers false.
    file: '0018_category_suggestions.sql',
    adds: 'Where Review keeps the AI’s suggested categories',
    checks: [{ kind: 'function', name: 'clear_candidate_suggestion', args: { p_candidate: NIL } }],
  },
  // 0019 and 0020 need 0018, and 0030 to 0037 need them; 0038 needs 0037.
  { file: '0019_ai_apps_cannot_write.sql', adds: KEPT_FOR_LATER, checks: [{ kind: 'function', name: '_not_an_ai_app', args: {} }] },
  { file: '0020_ai_apps.sql', adds: KEPT_FOR_LATER, checks: [{ kind: 'table', table: 'ai_app_access' }] },
  // The review fixes: each needs the one before it, and 0021 only 0018.
  { file: '0021_category_holds.sql', adds: 'Lets a category go once only a rejected guess or a removed charge names it', checks: [{ kind: 'schema', level: 21 }] },
  { file: '0022_removed_charge_waits.sql', adds: 'A charge you removed waits in Review when its statement comes in again', checks: [{ kind: 'schema', level: 22 }] },
  { file: '0023_typed_entry_once.sql', adds: 'Pressing Add again adds a typed purchase once', checks: [{ kind: 'schema', level: 23 }] },
  { file: '0024_learned_shops_own_category.sql', adds: 'Keeps each learned shop to your own categories', checks: [{ kind: 'schema', level: 24 }] },
  { file: '0025_ingested_text_format_characters.sql', adds: 'Keeps hidden characters out of stored text', checks: [{ kind: 'schema', level: 25 }] },
  { file: '0026_goal_check_on_link.sql', adds: 'Lets you edit a goal whose fund left the Savings list', checks: [{ kind: 'schema', level: 26 }] },
  { file: '0027_receipt_photo_twice_waits.sql', adds: 'A second photo of the same receipt waits in Review', checks: [{ kind: 'schema', level: 27 }] },
  { file: '0028_ai_words_no_invisible_characters.sql', adds: 'Keeps invisible characters out of the AI’s kept words', checks: [{ kind: 'schema', level: 28 }] },
  { file: '0029_lookalike_charge_waits.sql', adds: 'A charge already in your records under another statement waits in Review', checks: [{ kind: 'schema', level: 29 }] },
  // Out of number order on purpose: 0035 needs only 0020, and once it is in
  // the checks below read what 0030 to 0034 left.
  { file: '0035_ai_app_updates_in.sql', adds: KEPT_FOR_LATER, checks: [{ kind: 'function', name: 'ai_app_updates_in', args: {} }] },
  ...([30, 31, 32, 33, 34, 36, 37] as const).map((n) => ({ file: CHAIN_FILES[n], adds: KEPT_FOR_LATER, checks: [{ kind: 'chain', level: n }] as const })),
  {
    // Last of these: it needs 0029 and 0037. It deletes duplicate learned shops, so HANDOFF §3 asks for a backup first.
    file: '0038_intuit_prefix_merchants.sql',
    adds: 'Makes IN*SHOP and SHOP one shop. It deletes duplicate learned shops. First export merchant_rules from the Table Editor as a CSV',
    checks: [{ kind: 'schema', level: 38 }],
  },
  {
    // A review fix in kind: it moves schema_level() on from 0038's 38, and needs 0038 and 0016 (ADR 0015).
    file: '0041_ai_free_order.sql',
    adds: 'Tries the free, quick AI services first: OpenRouter, then Groq, then Gemini',
    checks: [{ kind: 'schema', level: 41 }],
  },
  { file: HELPER_FILE, adds: 'The AI helper, which every AI feature goes through', checks: [{ kind: 'helper' }] },
  {
    file: READ_RECEIPT_FILE,
    name: 'read-receipt',
    adds: 'Deleted, or its new version: the AI helper reads receipts without it',
    checks: [{ kind: 'read_receipt' }],
  },
]

/** What 0005's absence means: start where HANDOFF's list starts. */
export const FIRST_FILE = '0003_save_import_atomically.sql'

/** The first database update the list checks, 0005: missing, the owner starts at FIRST_FILE. */
const FIRST_CHECKED = '0005_category_kinds.sql'

/** `old`: a function (the AI helper or read-receipt) answers, but is a copy older than this app expects (N78). */
export type UpdateState = 'in' | 'missing' | 'old' | 'unknown'

export interface Checked {
  readonly update: Update
  readonly state: UpdateState
}

const MISSING: Readonly<Record<Check['kind'], ReadonlySet<string>>> = {
  table: new Set(['PGRST205', '42P01']),
  column: new Set(['42703']),
  function: new Set(['PGRST202', '42883']),
  helper: new Set(),
  read_receipt: new Set(),
  signups: new Set(),
  schema: new Set(['PGRST202', '42883']),
  chain: new Set(['PGRST202', '42883']),
}

/** This project's address, as the client itself names it, never typed or stored. */
const projectOrigin = (supabase: SupabaseClient): string => supabase.from('categories').url.origin

/**
 * Whether Allow new users to sign up is off, from the settings Supabase's
 * auth server publishes (`disable_signup`). Its gateway wants the public
 * key, the one already in the page, and nothing of the owner's is sent.
 * Anything but a true or false could not be checked.
 */
async function signupsOff(supabase: SupabaseClient): Promise<UpdateState> {
  const env = readEnv()
  if (!env.ok) return 'unknown'
  try {
    const reply = await fetch(`${projectOrigin(supabase)}/auth/v1/settings`, { headers: { apikey: env.env.VITE_SUPABASE_ANON_KEY } })
    if (!reply.ok) return 'unknown'
    const said = (await reply.json()) as Record<string, unknown> | null
    const off = typeof said === 'object' && said !== null ? said['disable_signup'] : null
    return off === true ? 'in' : off === false ? 'missing' : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Whether the platform has a function by this name (an address under
 * functions/v1), asked with a plain GET and nothing of the owner's. With
 * the sign-in headers a browser first asks permission, which Supabase
 * answers with 404 for a function that is not there, and the browser then
 * refuses to read the reply (Safari, 2026-10-16: every function row said
 * "?"). A plain GET needs no such question, and its 404 can be read. False
 * only on that 404; null when nothing could be read.
 */
async function isDeployed(supabase: SupabaseClient, path: string): Promise<boolean | null> {
  try {
    const reply = await fetch(`${projectOrigin(supabase)}/functions/v1/${path}`)
    if (reply.status !== 404) return true
    const said: unknown = await reply.json().catch(() => null)
    return typeof said === 'object' && said !== null && 'code' in said && said.code === 'NOT_FOUND' ? false : null
  } catch {
    return null
  }
}

/** The version a function's reply names, or null. */
const versionOf = (data: unknown): unknown => (typeof data === 'object' && data !== null && 'version' in data ? data.version : null)
/** A refusal's code, or '' where it has none. */
const codeOf = (error: { code?: unknown }): string => (typeof error.code === 'string' ? error.code : '')

async function probe(supabase: SupabaseClient, check: Check): Promise<UpdateState> {
  if (check.kind === 'signups') return signupsOff(supabase)
  if (check.kind === 'helper') {
    const answer = await askAi(supabase, { action: 'ping' })
    if (answer.ok) return isOlder(versionOf(answer.data)) ? 'old' : 'in'
    if (answer.view.state === 'not_deployed') return 'missing'
    return (await isDeployed(supabase, 'ai')) === false ? 'missing' : 'unknown'
  }
  if (check.kind === 'read_receipt') {
    // Deleted is in; one still there says which copy it is to a signed-in GET.
    if ((await isDeployed(supabase, 'read-receipt')) === false) return 'in'
    const { data, error } = await supabase.functions.invoke('read-receipt', { method: 'GET' })
    if (error !== null) {
      const status = (error as { context?: unknown }).context
      if (!(status instanceof Response)) return 'unknown'
      // Deleted is in; the copy from before 2026-10-01 refuses GET.
      return status.status === 404 ? 'in' : status.status === 405 ? 'old' : 'unknown'
    }
    return isOlder(versionOf(data), READ_RECEIPT_VERSION) ? 'old' : 'in'
  }
  if (check.kind === 'chain') {
    for (const name of ['ai_app_updates_in', 'ai_app_update_level']) {
      const { data, error } = await supabase.rpc(name, {})
      const gone = error !== null && MISSING.chain.has(codeOf(error))
      if (gone && name === 'ai_app_updates_in') continue
      if (error !== null) return gone ? 'missing' : 'unknown'
      return typeof data !== 'number' ? 'unknown' : data >= check.level ? 'in' : 'missing'
    }
    return 'unknown'
  }
  if (check.kind === 'schema') {
    const { data, error } = await supabase.rpc('schema_level', {})
    if (error !== null) return MISSING.schema.has(codeOf(error)) ? 'missing' : 'unknown'
    return typeof data !== 'number' ? 'unknown' : data >= check.level ? 'in' : 'missing'
  }
  const { error } =
    check.kind === 'function'
      ? await supabase.rpc(check.name, check.args)
      : await supabase.from(check.table).select(check.kind === 'column' ? check.column : '*').limit(0)
  if (error === null) return 'in'
  const code = codeOf(error)
  if (MISSING[check.kind].has(code)) return 'missing'
  // The function ran, and refused the nil id: it is there.
  return check.kind === 'function' && code === '42501' ? 'in' : 'unknown'
}

/**
 * Whether a function's version is older than the app's (the AI helper's,
 * unless another is named). Versions are `YYYY-MM-DD.N`; one that is not in
 * that shape is older, since every copy that ever shipped carries one.
 */
export function isOlder(version: unknown, wanted: string = AI_HELPER_VERSION): boolean {
  const parts = (v: unknown) => (typeof v === 'string' ? /^(\d{4}-\d{2}-\d{2})\.(\d+)$/.exec(v) : null)
  const have = parts(version)
  const want = parts(wanted)
  if (have === null || want === null) return true
  return have[1]! < want[1]! || (have[1] === want[1] && Number(have[2]) < Number(want[2]))
}

async function checkOne(supabase: SupabaseClient, update: Update): Promise<Checked> {
  const states = await Promise.all(update.checks.map((c) => probe(supabase, c)))
  const state: UpdateState = states.includes('missing') ? 'missing' : states.includes('old') ? 'old' : states.includes('unknown') ? 'unknown' : 'in'
  return { update, state }
}

/** Every update's state, all asked at once. */
export async function checkUpdates(supabase: SupabaseClient): Promise<Checked[]> {
  return Promise.all(UPDATES.map((update) => checkOne(supabase, update)))
}

export type NextStep =
  | { readonly kind: 'done' }
  | { readonly kind: 'paste'; readonly file: string; readonly fromStart: boolean }
  | { readonly kind: 'unknown' }

/**
 * The one thing to do next: the first update not in, in number order,
 * because each builds on the ones before. With 0005 missing that is
 * HANDOFF's first file, 0003, since 0003 and 0004 cannot be told apart
 * without writing; one already in is refused or runs again to the same result,
 * which does no harm.
 */
export function nextStep(checked: readonly Checked[]): NextStep {
  // An older helper is pasted again, over itself, as one not in yet is.
  const first = checked.find((c) => c.state === 'missing' || c.state === 'old')
  if (first !== undefined) {
    const fromStart = first.update.file === FIRST_CHECKED
    return { kind: 'paste', file: fromStart ? FIRST_FILE : first.update.file, fromStart }
  }
  return checked.some((c) => c.state === 'unknown') ? { kind: 'unknown' } : { kind: 'done' }
}
