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
import { createClient } from '@supabase/supabase-js'
import type {
  BudgetRow,
  Category,
  GoalRow,
  LedgerRow,
  NamedRow,
  PendingCandidate,
  UnreadableBatch,
  UnreadableLine,
} from '../src/ledger.js'
import type { SupabaseClient } from '../src/supabase.js'

type Row = Readonly<Record<string, unknown>>

export interface FakeTables {
  accounts: NamedRow[]
  categories: Category[]
  transactions: LedgerRow[]
  ingest_candidates: (PendingCandidate & { readonly status: string })[]
  merchant_rules: { readonly match_merchant: string; readonly category_id: string }[]
  savings_goals: GoalRow[]
  /** `period_end` only for a statement with a period (0007). */
  ingest_batches: (UnreadableBatch & { readonly period_end?: string | null })[]
  /** `dismissed_at` once dismissed (0012); absent reads as null, still waiting. */
  ingest_unreadable_lines: (UnreadableLine & { readonly dismissed_at?: string | null })[]
  /** Budgets and goals as typed (0008); `user_id` as the app writes it. */
  category_budgets: (BudgetRow & { readonly user_id?: string })[]
}

export interface RpcCall {
  readonly name: string
  readonly args: Readonly<Record<string, unknown>>
}

export interface FakeSupabase {
  readonly client: SupabaseClient
  readonly tables: FakeTables
  /** Every RPC the screen made, in order, with the exact arguments sent. */
  readonly rpcCalls: RpcCall[]
  /** What each RPC answers with. approve_candidate says 'approved' unless told otherwise. */
  readonly rpcReplies: Record<string, unknown>
  /**
   * Make a table or an RPC fail with this Postgres error code, e.g. `fail('rpc/approve_candidate', '42501')`,
   * or only one method on a table, e.g. `fail('PATCH categories', '23514')`.
   */
  fail(target: string, code: string): void
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
   * can make a read begun earlier arrive after one begun later.
   */
  readonly server: {
    maxRows: number | null
    afterRead: ((table: string) => void) | null
    hold: ((table: string) => Promise<void> | null) | null
  }
}

let clients = 0

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
    ...seed,
  }
  const rpcCalls: RpcCall[] = []
  const rpcReplies: Record<string, unknown> = {
    approve_candidate: 'approved',
    reject_candidate: null,
    recategorise_transaction: null,
    dismiss_unreadable_line: null,
  }
  const failures = new Map<string, string>()
  const server: FakeSupabase['server'] = { maxRows: null, afterRead: null, hold: null }
  const user = { id: 'u1', email: 'you@example.com', user_metadata: {} as Record<string, unknown> }
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

  // What 0012 does: stamp the line, keeping the first stamp. A line that is
  // not there is 42501, as there.
  function dismiss(args: Readonly<Record<string, unknown>>): Response {
    const at = tables.ingest_unreadable_lines.findIndex((l) => l.id === args['p_line'])
    const line = tables.ingest_unreadable_lines[at]
    if (line === undefined) return pgError('42501', 403)
    tables.ingest_unreadable_lines[at] = { ...line, dismissed_at: line.dismissed_at ?? '2026-09-23T12:00:00+00:00' }
    return new Response(null, { status: 204 })
  }

  async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
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
    const target = url.pathname.replace(/^\/rest\/v1\//, '')
    const failure = failures.get(target) ?? failures.get(`${method} ${target}`)
    if (failure !== undefined) return pgError(failure)

    if (target.startsWith('rpc/')) {
      const name = target.slice('rpc/'.length)
      rpcCalls.push({ name, args: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
      if (!(name in rpcReplies)) return pgError('PGRST202', 404)
      if (name === 'recategorise_transaction') return recategorise(rpcCalls[rpcCalls.length - 1]?.args ?? {})
      if (name === 'dismiss_unreadable_line') return dismiss(rpcCalls[rpcCalls.length - 1]?.args ?? {})
      return json(rpcReplies[name] ?? null)
    }

    if (!(target in tables)) return pgError('42P01', 404)
    const table = tables[target as keyof FakeTables] as Row[]
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
        added.push(row)
      }
      // Nothing is written until every row has passed, as in one statement.
      for (const row of added) {
        const at = conflict.length === 0 ? -1 : table.findIndex((r) => conflict.every((c) => r[c] === row[c]))
        const kept = table[at]
        if (kept === undefined) table.push(row)
        else table[at] = { ...kept, ...row, id: kept.id }
      }
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
      // ON DELETE RESTRICT, as 0001 declares for everything that files under a category.
      const inUse = (id: unknown) =>
        tables.transactions.some((t) => t.category_id === id) || tables.merchant_rules.some((m) => m.category_id === id)
      if (method === 'DELETE' && target === 'categories' && table.some((r) => matches(r) && inUse(r.id))) {
        return pgError('23503', 409)
      }
      if (target === 'categories' && table.some((r) => !matches(r) && body.name !== undefined && r.name === body.name)) {
        return pgError('23505', 409)
      }
      const next: Row[] = []
      for (const r of table) {
        if (!matches(r)) next.push(r)
        else if (method === 'PATCH') next.push({ ...r, ...body })
      }
      table.splice(0, table.length, ...next)
      return new Response(null, { status: 204 })
    }
    if (method !== 'GET') return pgError('FAKE_UNSUPPORTED_METHOD', 501)

    let rows = table.filter(matches)
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
    const picked = columns.includes('*') ? rows : rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])))

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
    global: { fetch: serve },
  })

  // A token of the right shape, made here rather than written out: the client
  // only decodes it for its expiry, and nothing checks the signature.
  const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signIn = async () => {
    const token = [part({ alg: 'none' }), part({ sub: user.id, exp: 4102444800 }), part('fake')].join('.')
    const { error } = await client.auth.setSession({ access_token: token, refresh_token: 'fake-refresh' })
    if (error !== null) throw error
  }

  return { client, tables, rpcCalls, rpcReplies, fail: (t, code) => void failures.set(t, code), user, signIn, server }
}
