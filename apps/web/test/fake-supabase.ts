/**
 * A Supabase stand-in for screen tests: the real client, a fake server.
 *
 * The screens take a SupabaseClient, and a hand-built object with `from` and
 * `rpc` cannot be one without a cast the Floor forbids. So this builds the
 * real supabase-js client and replaces only its `fetch`. The queries
 * src/ledger.ts writes are sent exactly as they would be in the app, and
 * answered here from in-memory tables typed by ledger.ts's own row types. A
 * query this server does not understand fails loudly rather than returning
 * an empty list that a test could mistake for "nothing there".
 *
 * Adapted from the screenshot harness's fake, keeping what the tests use.
 */
import { createClient, type OAuthGrant } from '@supabase/supabase-js'
import type {
  BudgetRow,
  Category,
  DebtExtraRow,
  DebtRow,
  FundRow,
  GoalRow,
  LedgerRow,
  ListedGoalRow,
  MonthBalanceRow,
  NamedRow,
  PayScheduleRow,
  PendingCandidate,
  PlanRow,
  UnreadableBatch,
  UnreadableLine,
} from '../src/ledger.js'
import type { SupabaseClient } from '../src/supabase.js'
import { watchNetwork } from '../src/offline.js'
import { AI_HELPER_VERSION, MCP_SERVER_VERSION, type AiStatusReply } from '@budget/schema'

type Row = Readonly<Record<string, unknown>>

export interface FakeTables {
  accounts: NamedRow[]
  categories: Category[]
  transactions: LedgerRow[]
  /** A suggested category (0018) may be left out; it reads as none. */
  ingest_candidates: (Omit<PendingCandidate, 'category_id' | 'category_source' | 'source' | 'batch_id'> &
    Partial<Pick<PendingCandidate, 'category_id' | 'category_source' | 'source' | 'batch_id'>> & { readonly status: string })[]
  merchant_rules: { readonly id?: string; readonly match_merchant: string; readonly category_id: string }[]
  /**
   * A goal from before 0013 may leave out its fund's columns; they read as
   * null. One may leave out when it was made and 0015's columns too; they
   * read as the database fills them in (see `server.lacks`).
   */
  savings_goals: (GoalRow &
    Partial<Pick<FundRow, 'category_id' | 'start_date' | 'balance_as_of'>> &
    Partial<Pick<ListedGoalRow, 'created_at' | 'sort_order' | 'status' | 'reached_on'>> & { readonly user_id?: string })[]
  /** `period_start` and `period_end` only for a statement with a period (0007); `ai_client_id` for an AI app's (0020). */
  ingest_batches: (UnreadableBatch & { readonly period_start?: string | null; readonly period_end?: string | null; readonly ai_client_id?: string | null })[]
  /** `dismissed_at` once dismissed (0012); absent reads as null, still waiting. */
  ingest_unreadable_lines: (UnreadableLine & { readonly dismissed_at?: string | null })[]
  /** Budgets and goals as typed (0008); `user_id` as the app writes it. */
  category_budgets: (BudgetRow & { readonly user_id?: string })[]
  /** Monthly amounts and days paid as typed (0009); `user_id` as the app writes it. */
  category_plans: (PlanRow & { readonly user_id?: string })[]
  /** Starting balances as typed (0010); `user_id` as the app writes it. */
  month_balances: (MonthBalanceRow & { readonly user_id?: string })[]
  /** Pay schedules as typed (0011); `user_id` as the app writes it. */
  pay_schedules: (PayScheduleRow & { readonly user_id?: string })[]
  /** Debts and their extra payments as typed (0014); `user_id` as the app writes it. */
  debts: (DebtRow & { readonly user_id?: string })[]
  debt_extra_payments: (DebtExtraRow & { readonly user_id?: string })[]
  /** The owner's AI choices (0016), as the app writes them. */
  ai_settings: {
    readonly user_id: string
    readonly models?: Readonly<Record<string, string>>
    readonly provider_order?: readonly string[]
    readonly allow_paid?: boolean
    readonly daily_cap?: number
    readonly tone?: string
    readonly share_shop_names?: boolean
  }[]
  /** The AI's checked words (0017): blanks, never a figure. */
  ai_notes: Row[]
  /** Causes the owner dismissed on the Coach (0017). */
  insight_dismissals: { readonly user_id?: string; readonly insight_key: string }[]
  /** The check-in's answers (0017). */
  coach_answers: Row[]
  /** The owner's switch for AI apps (0020). */
  ai_app_access: Row[]
  /** When each AI app last asked something (0020). */
  ai_app_last_use: Row[]
}

export interface RpcCall {
  readonly name: string
  readonly args: Readonly<Record<string, unknown>>
}

/**
 * What the AI helper's `status` says for an owner with nothing set up:
 * AI on, no key anywhere, no calls today. Tests change what they need.
 */
export function aiStatusReply(over: Partial<AiStatusReply> = {}): AiStatusReply {
  const none = { source: 'none', hint: null, status: null } as const
  return {
    ok: true,
    version: AI_HELPER_VERSION,
    enabled: true,
    allowPaid: false,
    services: [
      { provider: 'gemini', tier: 'free', model: 'gemini-3.5-flash-lite', ...none },
      { provider: 'groq', tier: 'free', model: 'openai/gpt-oss-20b', ...none },
      { provider: 'openrouter', tier: 'free', model: 'openrouter/free', ...none },
      { provider: 'openai', tier: 'paid', model: 'gpt-5-nano', ...none },
      { provider: 'anthropic', tier: 'paid', model: 'claude-haiku-4-5', ...none },
    ],
    today: { used: 0, cap: 40 },
    ...over,
  }
}

export interface FakeSupabase {
  readonly client: SupabaseClient
  readonly tables: FakeTables
  /** Every RPC the screen made, in order, with the exact arguments sent. */
  readonly rpcCalls: RpcCall[]
  /**
   * What each RPC answers with. approve_candidate says 'approved' unless
   * told otherwise, and approves the row as 0004 does unless told
   * 'already_handled'.
   */
  readonly rpcReplies: Record<string, unknown>
  /**
   * Make a table or an RPC fail with this Postgres error code, e.g. `fail('rpc/approve_candidate', '42501')`,
   * or only one method on a table, e.g. `fail('PATCH categories', '23514')`.
   */
  fail(target: string, code: string): void
  /** Stop failing what `fail` named: the server has come back. */
  heal(target: string): void
  /**
   * The AI helper, `functions/v1/ai`. `ai` answers each request's body;
   * null is a helper never deployed, which Supabase answers with its own
   * 404. By default it answers `ping`, `status` with `aiStatus`, and `run`
   * as a helper with no key does. Every body sent is kept in `calls`.
   */
  readonly functions: {
    ai: ((body: Readonly<Record<string, unknown>>) => Response | Promise<Response>) | null
    aiStatus: AiStatusReply
    readonly calls: Readonly<Record<string, unknown>>[]
    /** `functions/v1/read-receipt`, the older receipt reader; null, the default, is one never deployed. Its bodies are kept in `receiptCalls`. */
    readReceipt: ((body: Readonly<Record<string, unknown>>) => Response | Promise<Response>) | null
    readonly receiptCalls: Readonly<Record<string, unknown>>[]
    /** `functions/v1/mcp/health`, the AI apps server's; null is one never deployed. By default it answers with this app's version. */
    mcpHealth: (() => Response | Promise<Response>) | null
  }
  /**
   * Supabase's OAuth server (ADR 0012): `grants` are the AI apps the owner
   * allowed, which Settings lists; null, the default, is the server
   * switched off, which Supabase answers 404 feature_disabled. Each client
   * id Disconnect revokes is kept in `revoked`. Both need `signIn()`.
   */
  readonly oauth: { grants: OAuthGrant[] | null; readonly revoked: string[] }
  /** The signed-in user as the auth server holds it, `user_metadata` included. */
  readonly user: { id: string; email: string; user_metadata: Record<string, unknown> }
  /** Give the client a session, which `auth.updateUser` needs. `fail('auth/user', …)` makes updates fail. */
  signIn(): Promise<void>
  /**
   * How the server behaves. `maxRows` is PostgREST's cap on one response,
   * which Supabase sets to 1,000 and which wins over any limit a query asks
   * for. `afterRead` runs after each table read is answered, so a test can
   * change the table between two pages of one read. `hold` is asked as each
   * table read is answered; a promise it returns delays the answer, which
   * still carries the rows as they were when the read was asked, so a test
   * can make a read begun earlier arrive after one begun later. A write is
   * asked as `POST <table>` once it is stored, or refused, so its answer can
   * arrive late. `refuse` is asked before a read is answered, with its
   * query, and a code it returns fails that read alone, so a test can fail
   * one of two reads of the same table.
   */
  readonly server: {
    refuse: ((table: string, query: URLSearchParams) => string | null) | null
    maxRows: number | null
    afterRead: ((table: string) => void) | null
    hold: ((table: string) => Promise<void> | null) | null
    /**
     * Columns a table does not have yet, as before the update that adds
     * them, e.g. `{ savings_goals: ['sort_order', 'status', 'reached_on'] }`
     * before 0015. A read naming one is refused with 42703 and a write
     * naming one with PGRST204, as Postgres and PostgREST refuse each.
     */
    lacks: Readonly<Record<string, readonly string[]>>
    /** No reply at all, as with the phone off the network: every request's fetch rejects. */
    offline: boolean
  }
}

let clients = 0

/** The lists 0009 lets have a monthly amount. */
const RECURRING: ReadonlySet<string> = new Set(['bill', 'debt', 'subscription'])

export function createFakeSupabase(seed: Partial<FakeTables> = {}): FakeSupabase {
  const tables: FakeTables = {
    accounts: [{ id: 'a1', name: 'Main Card' }],
    categories: [],
    transactions: [],
    ingest_candidates: [],
    merchant_rules: [],
    savings_goals: [],
    ingest_batches: [],
    ingest_unreadable_lines: [],
    category_budgets: [],
    category_plans: [],
    month_balances: [],
    pay_schedules: [],
    debts: [],
    debt_extra_payments: [],
    ai_settings: [],
    ai_notes: [],
    insight_dismissals: [],
    coach_answers: [],
    ai_app_access: [],
    ai_app_last_use: [],
    ...seed,
  }
  const rpcCalls: RpcCall[] = []
  const rpcReplies: Record<string, unknown> = {
    approve_candidate: 'approved',
    reject_candidate: null,
    recategorise_transaction: null,
    dismiss_unreadable_line: null,
    // 0016: the caller's saved AI keys, never their ciphertext. None by default.
    ai_key_status: [],
    // 0018: answered by suggest() and clearSuggestion() below.
    suggest_candidate_categories: 0,
    clear_candidate_suggestion: false,
    // 0019: returns nothing for the owner's own session.
    _not_an_ai_app: null,
  }
  const failures = new Map<string, string>()
  const server: FakeSupabase['server'] = { refuse: null, maxRows: null, afterRead: null, hold: null, lacks: {}, offline: false }
  const user = { id: 'u1', email: 'you@example.com', user_metadata: {} as Record<string, unknown> }
  const functions: FakeSupabase['functions'] = {
    // With no key anywhere, a task is turned away as the helper would: not set up.
    ai: (body) =>
      body['action'] === 'ping'
        ? json({ ok: true, version: AI_HELPER_VERSION })
        : body['action'] === 'run'
          ? json({ ok: false, code: 'not_set_up' }, 409)
          : json(functions.aiStatus),
    aiStatus: aiStatusReply(),
    calls: [],
    readReceipt: null,
    receiptCalls: [],
    mcpHealth: () => json({ ok: true, version: MCP_SERVER_VERSION, tools: 0 }),
  }
  const oauth: FakeSupabase['oauth'] = { grants: null, revoked: [] }
  let nextId = 1

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
  const pgError = (code: string, status = 400) => json({ code, message: 'fake failure', details: null, hint: null }, status)

  // What 0006 does to the ledger, so a screen that re-reads the month after a
  // move sees the charge where it went. Either id not found is 42501, as there.
  // The rule it learns is keyed on the normalised merchant, which these rows
  // do not carry; tests read `p_learn` from rpcCalls instead.
  function recategorise(args: Readonly<Record<string, unknown>>): Response {
    const row = tables.transactions.findIndex((t) => t.id === args['p_transaction'])
    const known = tables.categories.some((c) => c.id === args['p_category'])
    const moving = tables.transactions[row]
    if (moving === undefined || !known) return pgError('42501', 403)
    tables.transactions[row] = { ...moving, category_id: String(args['p_category']) }
    return new Response(null, { status: 204 })
  }

  // What 0009's trigger on categories asks before a move: is an amount in
  // effect this month, or set for a later one? The month is the server's, in
  // UTC as the database's is, so a test that fixes the clock fixes it here.
  function planned(categoryId: unknown): boolean {
    const month = `${new Date().toISOString().slice(0, 7)}-01`
    const rows = tables.category_plans.filter((p) => p.category_id === categoryId)
    const now = rows.filter((p) => p.effective_month <= month).sort((a, b) => b.effective_month.localeCompare(a.effective_month))[0]
    return (now !== undefined && now.planned_cents !== null) || rows.some((p) => p.effective_month > month && p.planned_cents !== null)
  }

  // What 0012 does: stamp the line, keeping the first stamp. A line that is
  // not there is 42501, as there.
  function dismiss(args: Readonly<Record<string, unknown>>): Response {
    const at = tables.ingest_unreadable_lines.findIndex((l) => l.id === args['p_line'])
    const line = tables.ingest_unreadable_lines[at]
    if (line === undefined) return pgError('42501', 403)
    tables.ingest_unreadable_lines[at] = { ...line, dismissed_at: line.dismissed_at ?? '2026-09-23T12:00:00+00:00' }
    return new Response(null, { status: 204 })
  }

  // What 0004's approve_candidate does to the row: a category the caller
  // does not have is 42501; a row still waiting is approved into the
  // category, as the owner's choice, unless the reply a test set says it
  // had already been handled. Screens read the queue again after an
  // approval, and a row the fake left waiting came back into view.
  function approve(args: Readonly<Record<string, unknown>>): Response {
    if (!tables.categories.some((c) => c.id === args['p_category'])) return pgError('42501', 403)
    const reply = rpcReplies['approve_candidate']
    const at = tables.ingest_candidates.findIndex((r) => r.id === args['p_candidate'] && r.status === 'pending')
    const row = tables.ingest_candidates[at]
    if (row !== undefined && reply !== 'already_handled') {
      tables.ingest_candidates[at] = { ...row, status: 'approved', category_id: String(args['p_category']), category_source: 'user' }
    }
    return json(reply ?? null)
  }

  // What 0018 does: a suggestion only on a row still waiting that nobody
  // filled, only into a category that is not on Not spending; a clear only
  // of a suggestion. Each answers as the function does.
  const open = (r: FakeTables['ingest_candidates'][number]) => r.status === 'pending' && (r.category_id ?? null) === null
  function suggest(args: Readonly<Record<string, unknown>>): Response {
    const offered = args['p'] as { candidate: string; category: string }[]
    // 0018 refuses more than 200 at once, as invalid_parameter_value.
    if (offered.length > 200) return pgError('22023')
    let set = 0
    for (const { candidate, category } of offered) {
      const at = tables.ingest_candidates.findIndex((r) => r.id === candidate && (open(r) || r.category_source === 'model'))
      const row = tables.ingest_candidates[at]
      const kind = tables.categories.find((c) => c.id === category)?.kind
      if (row === undefined || kind === undefined || kind === 'transfer') continue
      tables.ingest_candidates[at] = { ...row, category_id: category, category_source: 'model' }
      set += 1
    }
    return json(set)
  }
  function clearSuggestion(args: Readonly<Record<string, unknown>>): Response {
    const at = tables.ingest_candidates.findIndex((r) => r.id === args['p_candidate'] && r.status === 'pending' && r.category_source === 'model')
    const row = tables.ingest_candidates[at]
    if (row !== undefined) tables.ingest_candidates[at] = { ...row, category_id: null, category_source: null }
    return json(row !== undefined)
  }

  // What 0004 and 0013 refuse of a goal, in the order Postgres meets it: the
  // BEFORE trigger (a category not on Savings), the CHECKs, then the unique
  // name and fund, then the key to the category, which the trigger leaves to it.
  function goalRefusal(row: Row, others: readonly Row[]): Response | null {
    const fund = row.category_id ?? null
    const kind = fund === null ? null : tables.categories.find((c) => c.id === fund)?.kind
    if (kind !== undefined && kind !== null && kind !== 'savings') return pgError('23514')
    if (Number(row.target_cents) <= 0 || (row.saved_cents !== undefined && Number(row.saved_cents) < 0)) return pgError('23514')
    // 0015: a reached goal says when, and no other goal carries a day.
    if (((row.status ?? 'active') === 'reached') !== ((row.reached_on ?? null) !== null)) return pgError('23514')
    if (fund !== null && (row.balance_as_of ?? null) === null) return pgError('23514')
    if (others.some((o) => o.name === row.name || (fund !== null && o.category_id === fund))) return pgError('23505', 409)
    if (kind === undefined) return pgError('23503', 409)
    return null
  }

  // What 0014 refuses of a debt: its CHECKs, then its unique name. Moving
  // a start month past one of its extras is its trigger's 23514.
  function debtRefusal(row: Row, others: readonly Row[]): Response | null {
    const negative = ['starting_balance_cents', 'minimum_payment_cents', 'apr_basis_points'].some((c) => Number(row[c]) < 0)
    if (negative || !String(row.start_date).endsWith('-01')) return pgError('23514')
    if (others.some((o) => o.name === row.name)) return pgError('23505', 409)
    const early = tables.debt_extra_payments.some((e) => e.debt_id === row.id && e.month < String(row.start_date))
    return early ? pgError('23514') : null
  }

  // What 0014 refuses of an extra: its trigger (before the debt's start), its
  // CHECKs, then the key to the debt, which the trigger leaves to it.
  function extraRefusal(row: Row): Response | null {
    const debt = tables.debts.find((d) => d.id === row.debt_id)
    if (debt !== undefined && String(row.month) < debt.start_date) return pgError('23514')
    if (Number(row.amount_cents) <= 0 || !String(row.month).endsWith('-01')) return pgError('23514')
    return debt === undefined ? pgError('23503', 409) : null
  }

  async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (server.offline) throw new TypeError('Failed to fetch')
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    if (url.pathname === '/auth/v1/user/oauth/grants') {
      if (oauth.grants === null) return json({ code: 404, error_code: 'feature_disabled', msg: 'OAuth server is disabled' }, 404)
      if (method === 'GET') return json(oauth.grants)
      const revoked = url.searchParams.get('client_id')
      oauth.revoked.push(String(revoked))
      oauth.grants = oauth.grants.filter((g) => g.client.id !== revoked)
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/auth/v1/user') {
      // GET when a session is set, PUT for updateUser, which merges `data`
      // into user_metadata as the auth server does.
      if (method === 'PUT') {
        if (failures.has('auth/user')) return json({ code: 'unexpected_failure', msg: 'fake failure' }, 500)
        const body = JSON.parse(String(init?.body)) as { data?: Record<string, unknown> }
        Object.assign(user.user_metadata, body.data)
      }
      return json({ ...user, aud: 'authenticated', app_metadata: {}, created_at: '2026-01-01T00:00:00Z' })
    }
    if (url.pathname === '/functions/v1/ai') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      functions.calls.push(body)
      if (functions.ai === null) return json({ code: 'NOT_FOUND', message: 'Requested function was not found' }, 404)
      return functions.ai(body)
    }
    if (url.pathname === '/functions/v1/mcp/health') {
      if (functions.mcpHealth === null) return json({ code: 'NOT_FOUND', message: 'Requested function was not found' }, 404)
      return functions.mcpHealth()
    }
    if (url.pathname === '/functions/v1/read-receipt') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      functions.receiptCalls.push(body)
      if (functions.readReceipt === null) return json({ code: 'NOT_FOUND', message: 'Requested function was not found' }, 404)
      return functions.readReceipt(body)
    }
    const target = url.pathname.replace(/^\/rest\/v1\//, '')
    const failure = failures.get(target) ?? failures.get(`${method} ${target}`)
    if (failure !== undefined) {
      // A write's refusal can arrive late, as its success can (`POST <table>`).
      const held = method === 'POST' ? server.hold?.(`POST ${target}`) : null
      if (held !== undefined && held !== null) await held
      return pgError(failure)
    }

    if (target.startsWith('rpc/')) {
      const name = target.slice('rpc/'.length)
      rpcCalls.push({ name, args: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
      if (!(name in rpcReplies)) return pgError('PGRST202', 404)
      if (name === 'recategorise_transaction') return recategorise(rpcCalls[rpcCalls.length - 1]?.args ?? {})
      if (name === 'dismiss_unreadable_line') return dismiss(rpcCalls[rpcCalls.length - 1]?.args ?? {})
      if (name === 'approve_candidate') return approve(rpcCalls[rpcCalls.length - 1]?.args ?? {})
      if (name === 'suggest_candidate_categories') return suggest(rpcCalls[rpcCalls.length - 1]?.args ?? {})
      if (name === 'clear_candidate_suggestion') return clearSuggestion(rpcCalls[rpcCalls.length - 1]?.args ?? {})
      return json(rpcReplies[name] ?? null)
    }

    if (!(target in tables)) return pgError('42P01', 404)
    const table = tables[target as keyof FakeTables] as Row[]
    const lacked = new Set(server.lacks[target] ?? [])
    const names = (fields: Row) => Object.keys(fields).some((column) => lacked.has(column))
    const wantsObject = headers.get('accept')?.startsWith('application/vnd.pgrst.object+json') === true

    if (method === 'POST') {
      const body = JSON.parse(String(init?.body)) as Row | Row[]
      // An upsert with ignoreDuplicates is ON CONFLICT DO NOTHING: a taken
      // name is skipped. Without it, one taken name refuses the whole write.
      const skipTaken = headers.get('prefer')?.includes('resolution=ignore-duplicates') === true
      // Any other upsert is ON CONFLICT (on_conflict) DO UPDATE: a row
      // matching on those columns is replaced rather than added.
      const merge = headers.get('prefer')?.includes('resolution=merge-duplicates') === true
      const conflict = merge ? (url.searchParams.get('on_conflict')?.split(',') ?? []) : []
      const added: Row[] = []
      for (const fields of Array.isArray(body) ? body : [body]) {
        if (names(fields)) return pgError('PGRST204')
        const row: Row = { id: `new-${nextId++}`, ...fields }
        // What the database refuses, in the order it checks: NOT NULL before
        // UNIQUE. Since 0005 a category has no default list (N11).
        if (target === 'categories' && row.kind === undefined) return pgError('23502')
        const named = target === 'categories' || target === 'accounts'
        if (named && [...table, ...added].some((r) => r.name === row.name)) {
          if (skipTaken) continue
          return pgError('23505', 409)
        }
        // What 0008 refuses: its CHECKs, then the key to the category.
        if (target === 'category_budgets') {
          if ((typeof row.budget_cents === 'number' && row.budget_cents < 0) || !String(row.month).endsWith('-01')) {
            return pgError('23514')
          }
          if (!tables.categories.some((c) => c.id === row.category_id)) return pgError('23503', 409)
        }
        // What 0009 refuses, in the order Postgres meets it: the BEFORE
        // trigger (a list that cannot have an amount), its CHECKs, then the
        // key to the category, which the trigger leaves to it.
        if (target === 'category_plans') {
          const kind = tables.categories.find((c) => c.id === row.category_id)?.kind
          if (kind !== undefined && !RECURRING.has(kind)) return pgError('23514')
          const day = row.due_day
          if ((typeof row.planned_cents === 'number' && row.planned_cents < 0) || !String(row.effective_month).endsWith('-01')) {
            return pgError('23514')
          }
          if (typeof day === 'number' && (day < 1 || day > 31)) return pgError('23514')
          if (kind === undefined) return pgError('23503', 409)
        }
        // What 0010 refuses: a blank balance (NOT NULL), then a month that is not its first day.
        if (target === 'month_balances') {
          if (row.starting_balance_cents === null || row.starting_balance_cents === undefined) return pgError('23502')
          if (!String(row.month).endsWith('-01')) return pgError('23514')
        }
        // What 0011 refuses: its trigger (a list other than Income), then the key to the category.
        if (target === 'pay_schedules') {
          const kind = tables.categories.find((c) => c.id === row.category_id)?.kind
          if (kind !== undefined && kind !== 'income') return pgError('23514')
          if (kind === undefined) return pgError('23503', 409)
        }
        if (target === 'savings_goals') {
          const refused = goalRefusal(row, [...table, ...added])
          if (refused !== null) return refused
        }
        const refused =
          target === 'debts' ? debtRefusal(row, [...table, ...added]) : target === 'debt_extra_payments' ? extraRefusal(row) : null
        if (refused !== null) return refused
        added.push(row)
      }
      // Nothing is written until every row has passed, as in one statement.
      for (const row of added) {
        const at = conflict.length === 0 ? -1 : table.findIndex((r) => conflict.every((c) => r[c] === row[c]))
        const kept = table[at]
        if (kept === undefined) table.push(row)
        else table[at] = { ...kept, ...row, id: kept.id }
      }
      const held = server.hold?.(`POST ${target}`)
      if (held !== undefined && held !== null) await held
      return json(wantsObject ? added[0] : added, 201)
    }

    // The filters, as one test per row, for reads, updates and deletes alike.
    const tests: ((r: Row) => boolean)[] = []
    for (const [key, value] of url.searchParams) {
      if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset') continue
      const [op, operand] = [value.slice(0, value.indexOf('.')), value.slice(value.indexOf('.') + 1)]
      if (op === 'eq') tests.push((r) => String(r[key]) === operand)
      else if (op === 'gte') tests.push((r) => String(r[key]) >= operand)
      else if (op === 'lte') tests.push((r) => String(r[key]) <= operand)
      else if (op === 'not' && operand === 'is.null') tests.push((r) => r[key] !== null && r[key] !== undefined)
      else if (op === 'is' && operand === 'null') tests.push((r) => r[key] === null || r[key] === undefined)
      else if (op === 'in') {
        // `in.(a,b)`, with a value quoted only when it holds a reserved character.
        const members = new Set(operand.slice(1, -1).split(',').map((v) => v.replace(/^"(.*)"$/, '$1')))
        tests.push((r) => members.has(String(r[key])))
      }
      else return pgError('FAKE_UNSUPPORTED_FILTER', 501)
    }
    const matches = (r: Row) => tests.every((test) => test(r))

    if (method === 'PATCH' || method === 'DELETE') {
      const body = method === 'PATCH' ? (JSON.parse(String(init?.body)) as Row) : {}
      if (names(body)) return pgError('PGRST204')
      // ON DELETE RESTRICT, as 0001 declares for everything that files under a category.
      const inUse = (id: unknown) =>
        tables.transactions.some((t) => t.category_id === id) || tables.merchant_rules.some((m) => m.category_id === id)
      if (method === 'DELETE' && target === 'categories' && table.some((r) => matches(r) && inUse(r.id))) {
        return pgError('23503', 409)
      }
      if (target === 'categories' && table.some((r) => !matches(r) && body.name !== undefined && r.name === body.name)) {
        return pgError('23505', 409)
      }
      if (target === 'categories' && table.some((r) => matches(r) && body.kind !== undefined && body.kind !== r.kind && planned(r.id))) {
        return pgError('23514')
      }
      if (method === 'PATCH' && target === 'savings_goals') {
        for (const r of table.filter(matches)) {
          const refused = goalRefusal({ ...r, ...body }, table.filter((o) => o !== r))
          if (refused !== null) return refused
        }
      }
      if (method === 'PATCH' && (target === 'debts' || target === 'debt_extra_payments')) {
        for (const r of table.filter(matches)) {
          const edited = { ...r, ...body }
          const refused = target === 'debts' ? debtRefusal(edited, table.filter((o) => o !== r)) : extraRefusal(edited)
          if (refused !== null) return refused
        }
      }
      const next: Row[] = []
      for (const r of table) {
        if (!matches(r)) next.push(r)
        else if (method === 'PATCH') next.push({ ...r, ...body })
      }
      table.splice(0, table.length, ...next)
      // A category takes its budgets, monthly amounts and schedule with it (0008, 0009, 0011: ON DELETE CASCADE).
      if (method === 'DELETE' && target === 'categories') {
        const kept = (r: { category_id: string }) => tables.categories.some((c) => c.id === r.category_id)
        tables.category_budgets = tables.category_budgets.filter(kept)
        tables.category_plans = tables.category_plans.filter(kept)
        tables.pay_schedules = tables.pay_schedules.filter(kept)
      }
      // A debt takes its extra payments with it (0014: ON DELETE CASCADE).
      if (method === 'DELETE' && target === 'debts') {
        tables.debt_extra_payments = tables.debt_extra_payments.filter((e) => tables.debts.some((d) => d.id === e.debt_id))
      }
      return new Response(null, { status: 204 })
    }
    if (method !== 'GET') return pgError('FAKE_UNSUPPORTED_METHOD', 501)
    const refused = server.refuse?.(target, url.searchParams)
    if (refused !== undefined && refused !== null) return pgError(refused)
    const asked = [url.searchParams.get('select') ?? '', url.searchParams.get('order') ?? ''].join(',')
    if (asked.split(',').some((term) => lacked.has(term.trim().split('.')[0] ?? ''))) return pgError('42703')

    // What 0004 and 0015 fill in for a goal written without them: when it
    // was made, in the order the rows were added, place 0 and active. A
    // column the table lacks is not filled in.
    const filled =
      target === 'savings_goals'
        ? table.map((r, i) => ({
            ...Object.fromEntries(
              Object.entries({ created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), sort_order: 0, status: 'active', reached_on: null })
                .filter(([column]) => !lacked.has(column)),
            ),
            ...r,
          }))
        : table
    let rows = filled.filter(matches)
    const order = url.searchParams.get('order')
    if (order !== null) {
      // `order=a.asc,b.asc`: by the first column, then the next on a tie.
      const keys = order.split(',').map((term) => {
        const [column = '', direction] = term.split('.')
        return { column, sign: direction === 'desc' ? -1 : 1 }
      })
      // Numbers as numbers, as Postgres does: as strings, line 10 sorts before line 9.
      const compare = (a: unknown, b: unknown) =>
        typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
      rows.sort((a, b) => {
        for (const { column, sign } of keys) {
          const by = sign * compare(a[column], b[column])
          if (by !== 0) return by
        }
        return 0
      })
    }
    const total = rows.length
    const offsetParam = url.searchParams.get('offset')
    const offset = offsetParam === null ? 0 : Number(offsetParam)
    const limitParam = url.searchParams.get('limit')
    const caps = [limitParam === null ? null : Number(limitParam), server.maxRows].filter((n): n is number => n !== null)
    rows = rows.slice(offset, caps.length === 0 ? undefined : offset + Math.min(...caps))
    const columns = (url.searchParams.get('select') ?? '*').split(',')
    const picked = columns.includes('*') ? rows : rows.map((r) => Object.fromEntries(columns.map((c) => [c.trim(), r[c.trim()] ?? null])))

    server.afterRead?.(target)
    const held = server.hold?.(target)
    if (held !== undefined && held !== null) await held
    if (wantsObject) return picked.length === 1 ? json(picked[0]) : pgError('PGRST116', 406)
    // As PostgREST writes it: the rows sent, then the total; `*` when none were.
    const sent = picked.length === 0 ? '*' : `${offset}-${offset + picked.length - 1}`
    const range = headers.get('prefer')?.includes('count=exact') === true ? { 'content-range': `${sent}/${total}` } : {}
    return json(picked, 200, range)
  }

  const client = createClient('http://fake.supabase.test', 'fake-anon-key', {
    // A key per client: each test builds its own, and supabase-js warns when
    // two share one in the same window.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `fake-${clients++}` },
    // Watched as the app's own client is (supabase.ts), so the offline line shows here too.
    global: { fetch: watchNetwork(serve) },
  })

  // A token of the right shape, made here rather than written out: the client
  // only decodes it for its expiry, and nothing checks the signature.
  const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signIn = async () => {
    const token = [part({ alg: 'none' }), part({ sub: user.id, exp: 4102444800 }), part('fake')].join('.')
    const { error } = await client.auth.setSession({ access_token: token, refresh_token: 'fake-refresh' })
    if (error !== null) throw error
  }

  return { client, tables, rpcCalls, rpcReplies, functions, fail: (t, code) => void failures.set(t, code), heal: (t) => void failures.delete(t), oauth, user, signIn, server }
}
