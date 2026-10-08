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
import { AI_HELPER_VERSION, MCP_SERVER_VERSION, READ_RECEIPT_VERSION } from '@budget/schema'
import { askAi } from '../ai/client.js'
import { serverAddress } from '../ai-apps/access.js'
import { readEnv } from '../env.js'
import type { SupabaseClient } from '../supabase.js'

type Check =
  | { readonly kind: 'table'; readonly table: string }
  | { readonly kind: 'column'; readonly table: string; readonly column: string }
  | { readonly kind: 'function'; readonly name: string; readonly args: Readonly<Record<string, unknown>> }
  /** The AI helper answers `ping` once it is deployed; Supabase answers 404 until then. */
  | { readonly kind: 'helper' }
  /** The AI apps server answers `/mcp/health` with its version once it is deployed (ADR 0012). */
  | { readonly kind: 'server' }
  /**
   * read-receipt: in when deleted (Supabase's 404) or when it answers GET
   * with a version at least READ_RECEIPT_VERSION; an older copy answers 405
   * and relies on the gateway's JWT switch alone (security review mcp-3-03).
   */
  | { readonly kind: 'read_receipt' }
  /** Which key Supabase signs the owner's sign-in with, read from the owner's own token. */
  | { readonly kind: 'signing_key' }
  /** Supabase's OAuth server, from the settings it publishes for AI apps to find. */
  | { readonly kind: 'oauth' }
  /** Allow new users to sign up, off: from the settings Supabase's auth server publishes (backend-b-06). */
  | { readonly kind: 'signups' }
  /**
   * An AI-app security update (0030 on): they change only functions the
   * owner's session cannot tell apart. Each is in when the last one in is
   * at least `level`: as ai_app_updates_in() reads it from the functions
   * (0035), or, before 0035, the number each left in ai_app_update_level().
   */
  | { readonly kind: 'level'; readonly level: number }
  /**
   * One of the review fixes (0021 to 0029, and 0038): each re-creates
   * schema_level() (0021) to answer its own number, and is in when that
   * answer is at least `level`.
   */
  | { readonly kind: 'schema'; readonly level: number }

/** The AI helper's source, as One-time updates names it and /setup/ serves it (ADR 0007). */
export const HELPER_FILE = 'ai-function.ts'

/**
 * read-receipt's source, offered beside the AI helper to paste again or
 * delete: the app reads receipts through the helper, and a copy from before
 * 2026-09-30 lets anyone holding the app's public key spend the Gemini key.
 */
export const READ_RECEIPT_FILE = 'read-receipt-function.ts'

/** The AI apps server, built at site build and served under /setup/ (ADR 0012). */
export const SERVER_FILE = 'mcp-function.ts'

/** Two steps made in Supabase's settings, with no file to paste (PLAN §1, steps 3 and 4). */
export const SIGNING_KEY = 'signing-key'
export const OAUTH_SERVER = 'oauth-server'

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

/** Sign-ups off, 0005 to 0029, 0035, 0030 to 0041, the AI helper, the two settings and the AI apps server, each with what it adds. */
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
  {
    // The owner's own session is not an AI app, so this returns and changes nothing.
    // Listed after 0018, so it is offered only once 0018 is in, which it needs.
    file: '0019_ai_apps_cannot_write.sql',
    adds: 'Stops an AI app you connect from changing your records itself',
    checks: [{ kind: 'function', name: '_not_an_ai_app', args: {} }],
  },
  {
    // Listed after 0019, so it is offered only once 0019 is in, which it needs.
    file: '0020_ai_apps.sql',
    adds: 'What an AI app you connect may read, and adding to Review, with a switch and daily limits',
    checks: [{ kind: 'table', table: 'ai_app_access' }],
  },
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
  {
    // Out of number order on purpose: it needs only 0020, and once it is in
    // the checks below read what 0030 to 0034 left, so pasting one again
    // never offers a later one that is already in.
    file: '0035_ai_app_updates_in.sql',
    adds: 'Lets One-time updates see exactly which AI app safety updates are in',
    checks: [{ kind: 'function', name: 'ai_app_updates_in', args: {} }],
  },
  {
    // Listed after 0020, so it is offered only once 0020 is in, which it needs.
    file: '0030_ai_app_gate_live_session.sql',
    adds: 'Stops an AI app the moment you disconnect it',
    checks: [{ kind: 'level', level: 30 }],
  },
  {
    file: '0031_ai_app_hash_own_kind.sql',
    adds: 'Keeps what an AI app adds from hiding a real charge on your statement',
    checks: [{ kind: 'level', level: 31 }],
  },
  {
    file: '0032_ai_rows_teach_no_rule.sql',
    adds: 'Keeps an AI app’s words from becoming a shop the app files by itself',
    checks: [{ kind: 'level', level: 32 }],
  },
  {
    file: '0033_ai_search_masked.sql',
    adds: 'Keeps the long numbers in shop names hidden from an AI app’s searches',
    checks: [{ kind: 'level', level: 33 }],
  },
  {
    file: '0034_ai_words_visible.sql',
    adds: 'Keeps an AI app from adding entries that look alike but are not',
    checks: [{ kind: 'level', level: 34 }],
  },
  {
    file: '0036_ai_search_as_shown.sql',
    adds: 'Keeps an AI app’s searches to the shop names it is shown',
    checks: [{ kind: 'level', level: 36 }],
  },
  {
    file: '0037_ai_rows_before_the_fixes.sql',
    adds: 'Tidies anything an AI app added before these safety updates',
    checks: [{ kind: 'level', level: 37 }],
  },
  {
    // Last: it needs 0029 and 0037. It deletes duplicate learned shops, so HANDOFF §3 asks for a backup first.
    file: '0038_intuit_prefix_merchants.sql',
    adds: 'Makes IN*SHOP and SHOP one shop. It deletes duplicate learned shops. First export merchant_rules from the Table Editor as a CSV',
    checks: [{ kind: 'schema', level: 38 }],
  },
  {
    // An AI-app update (ADR 0013): it needs 0037, and comes after 0038 in HANDOFF's order.
    file: '0039_ai_apps_suggest_changes.sql',
    adds: 'Lets an AI app suggest changes, which wait in Review until you apply them',
    checks: [{ kind: 'level', level: 39 }],
  },
  {
    // An AI-app update: it needs 0039, whose words check it tightens (testing db-01),
    // and lets a budget from a month on put that month's own back (skills-02).
    file: '0040_ai_words_every_character_shown.sql',
    adds: 'Stops an AI app adding or suggesting words with hidden characters. Lets it suggest putting a month back to your usual budget',
    checks: [{ kind: 'level', level: 40 }],
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
  { file: SIGNING_KEY, name: 'Signing key', adds: 'The key Supabase signs your sign-in with, which ChatGPT needs', checks: [{ kind: 'signing_key' }] },
  { file: OAUTH_SERVER, name: 'Sign-in for AI apps', adds: 'Lets Claude or ChatGPT ask you to allow them', checks: [{ kind: 'oauth' }] },
  { file: SERVER_FILE, adds: 'The AI apps server, which Claude or ChatGPT connect to', checks: [{ kind: 'server' }] },
]

/** What 0005's absence means: start where HANDOFF's list starts. */
export const FIRST_FILE = '0003_save_import_atomically.sql'

/** The first database update the list checks, 0005: missing, the owner starts at FIRST_FILE. */
const FIRST_CHECKED = '0005_category_kinds.sql'

/** `old`: a function (the AI helper, read-receipt or the AI apps server) answers, but is a copy older than this app expects (N78). */
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
  server: new Set(),
  read_receipt: new Set(),
  signing_key: new Set(),
  oauth: new Set(),
  signups: new Set(),
  level: new Set(['PGRST202', '42883']),
  schema: new Set(['PGRST202', '42883']),
}

/**
 * The key that signed the owner's own session, read from its header here
 * and sent nowhere. Supabase gives ChatGPT the ID token it asks for only
 * when it signs with an asymmetric key (PLAN §2.3): ES256, or RS256, is
 * in; the legacy shared secret, HS256, is the step still to do. Anything
 * else, or no session, could not be checked.
 */
async function signingKey(supabase: SupabaseClient): Promise<UpdateState> {
  const { data } = await supabase.auth.getSession()
  const head = data.session?.access_token.split('.')[0]
  if (head === undefined) return 'unknown'
  try {
    const { alg } = JSON.parse(atob(head.replaceAll('-', '+').replaceAll('_', '/'))) as { alg?: unknown }
    return alg === 'ES256' || alg === 'RS256' ? 'in' : alg === 'HS256' ? 'missing' : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Whether Supabase's OAuth server is on and lets apps register themselves,
 * from the settings it publishes for Claude and ChatGPT to find (PLAN
 * §2.11). Asked with the browser's own fetch and nothing of the owner's,
 * so no token leaves and the browser needs no preflight. Supabase's own
 * 404 `feature_disabled` is off; on without a registration address (the
 * step's last switch), or without the S256 ChatGPT requires, is not done
 * either. Anything else could not be checked (PLAN K13).
 */
async function signInForAiApps(supabase: SupabaseClient): Promise<UpdateState> {
  try {
    const reply = await fetch(`${new URL(serverAddress(supabase)).origin}/.well-known/oauth-authorization-server/auth/v1`)
    const said = (await reply.json()) as Record<string, unknown> | null
    if (reply.status === 404) return said?.['error_code'] === 'feature_disabled' ? 'missing' : 'unknown'
    if (!reply.ok || typeof said !== 'object' || said === null) return 'unknown'
    const methods = said['code_challenge_methods_supported']
    return typeof said['registration_endpoint'] === 'string' && Array.isArray(methods) && methods.includes('S256') ? 'in' : 'missing'
  } catch {
    return 'unknown'
  }
}

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
    const reply = await fetch(`${new URL(serverAddress(supabase)).origin}/auth/v1/settings`, { headers: { apikey: env.env.VITE_SUPABASE_ANON_KEY } })
    if (!reply.ok) return 'unknown'
    const said = (await reply.json()) as Record<string, unknown> | null
    const off = typeof said === 'object' && said !== null ? said['disable_signup'] : null
    return off === true ? 'in' : off === false ? 'missing' : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** The version a function's reply names, or null. */
const versionOf = (data: unknown): unknown => (typeof data === 'object' && data !== null && 'version' in data ? data.version : null)
/** A refusal's code, or '' where it has none. */
const codeOf = (error: { code?: unknown }): string => (typeof error.code === 'string' ? error.code : '')

async function probe(supabase: SupabaseClient, check: Check): Promise<UpdateState> {
  if (check.kind === 'signups') return signupsOff(supabase)
  if (check.kind === 'signing_key') return signingKey(supabase)
  if (check.kind === 'oauth') return signInForAiApps(supabase)
  if (check.kind === 'helper') {
    const answer = await askAi(supabase, { action: 'ping' })
    if (!answer.ok) return answer.view.state === 'not_deployed' ? 'missing' : 'unknown'
    return isOlder(versionOf(answer.data)) ? 'old' : 'in'
  }
  if (check.kind === 'read_receipt') {
    const { data, error } = await supabase.functions.invoke('read-receipt', { method: 'GET' })
    if (error !== null) {
      const status = (error as { context?: unknown }).context
      if (!(status instanceof Response)) return 'unknown'
      // Deleted is in; the copy from before 2026-10-01 refuses GET.
      return status.status === 404 ? 'in' : status.status === 405 ? 'old' : 'unknown'
    }
    return isOlder(versionOf(data), READ_RECEIPT_VERSION) ? 'old' : 'in'
  }
  if (check.kind === 'server') {
    const { data, error } = await supabase.functions.invoke('mcp/health', { method: 'GET' })
    if (error !== null) {
      const reply = (error as { context?: unknown }).context
      return reply instanceof Response && reply.status === 404 ? 'missing' : 'unknown'
    }
    return isOlder(versionOf(data), MCP_SERVER_VERSION) ? 'old' : 'in'
  }
  if (check.kind === 'level') {
    for (const name of ['ai_app_updates_in', 'ai_app_update_level']) {
      const { data, error } = await supabase.rpc(name, {})
      const gone = error !== null && MISSING.level.has(codeOf(error))
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

/**
 * What must be in before AI apps may be switched on or a connection
 * allowed (security review mcp-3-03), as 0020 already is: sign-ups off,
 * since the AI apps server takes any account's token and a stranger who
 * made one could connect an app to it (review of 2026-10-02); 0019, which
 * stops an AI app writing; 0020; 0030 to 0034, 0036 and 0037, which close
 * what the security review found open in 0020 (a disconnected app's token,
 * an AI row hiding a statement line or teaching a shop, a search reading
 * masked numbers, invisible characters) and clean up what was left before; the AI helper from 2026-09-30.1, the
 * first to refuse an AI app's token (an older one would let it spend the
 * owner's keys or save one of its own); read-receipt deleted or replaced;
 * and the AI apps server at this app's version, whose hashes 0031 checks.
 * Ready, or the first not in (null when one could not be checked: off
 * until it can be).
 */
const BEFORE_AI_APPS: readonly string[] = [
  SIGNUPS_OFF,
  '0019_ai_apps_cannot_write.sql',
  '0020_ai_apps.sql',
  '0030_ai_app_gate_live_session.sql',
  '0031_ai_app_hash_own_kind.sql',
  '0032_ai_rows_teach_no_rule.sql',
  '0033_ai_search_masked.sql',
  '0034_ai_words_visible.sql',
  '0036_ai_search_as_shown.sql',
  '0037_ai_rows_before_the_fixes.sql',
  HELPER_FILE,
  READ_RECEIPT_FILE,
  SERVER_FILE,
]

export type Readiness = { readonly ready: true } | { readonly ready: false; readonly file: string | null }

export async function aiAppsReady(supabase: SupabaseClient): Promise<Readiness> {
  const checked = await Promise.all(UPDATES.filter((u) => BEFORE_AI_APPS.includes(u.file)).map((u) => checkOne(supabase, u)))
  const first = checked.find((c) => c.state === 'missing' || c.state === 'old')
  if (first !== undefined) return { ready: false, file: first.update.file }
  return checked.every((c) => c.state === 'in') ? { ready: true } : { ready: false, file: null }
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
