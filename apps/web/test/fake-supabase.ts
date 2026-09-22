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
  ingest_batches: UnreadableBatch[]
  ingest_unreadable_lines: UnreadableLine[]
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
  /** Make a table read or an RPC fail with this Postgres error code, e.g. `fail('rpc/approve_candidate', '42501')`. */
  fail(target: string, code: string): void
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
    ...seed,
  }
  const rpcCalls: RpcCall[] = []
  const rpcReplies: Record<string, unknown> = { approve_candidate: 'approved', reject_candidate: null }
  const failures = new Map<string, string>()
  let nextId = 1

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
  const pgError = (code: string, status = 400) => json({ code, message: 'fake failure', details: null, hint: null }, status)

  async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const target = url.pathname.replace(/^\/rest\/v1\//, '')
    const failure = failures.get(target)
    if (failure !== undefined) return pgError(failure)

    if (target.startsWith('rpc/')) {
      const name = target.slice('rpc/'.length)
      rpcCalls.push({ name, args: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
      if (!(name in rpcReplies)) return pgError('PGRST202', 404)
      return json(rpcReplies[name] ?? null)
    }

    if (!(target in tables)) return pgError('42P01', 404)
    const table = tables[target as keyof FakeTables] as Row[]
    const wantsObject = headers.get('accept')?.startsWith('application/vnd.pgrst.object+json') === true

    if (method === 'POST') {
      const row = { id: `new-${nextId++}`, ...(JSON.parse(String(init?.body)) as Row) }
      table.push(row)
      return json(wantsObject ? row : [row], 201)
    }
    if (method !== 'GET') return pgError('FAKE_UNSUPPORTED_METHOD', 501)

    let rows = [...table]
    for (const [key, value] of url.searchParams) {
      if (key === 'select' || key === 'order' || key === 'limit') continue
      const [op, operand] = [value.slice(0, value.indexOf('.')), value.slice(value.indexOf('.') + 1)]
      if (op === 'eq') rows = rows.filter((r) => String(r[key]) === operand)
      else if (op === 'gte') rows = rows.filter((r) => String(r[key]) >= operand)
      else if (op === 'lte') rows = rows.filter((r) => String(r[key]) <= operand)
      else if (op === 'in') {
        // `in.(a,b)`, with a value quoted only when it holds a reserved character.
        const members = new Set(operand.slice(1, -1).split(',').map((v) => v.replace(/^"(.*)"$/, '$1')))
        rows = rows.filter((r) => members.has(String(r[key])))
      }
      else return pgError('FAKE_UNSUPPORTED_FILTER', 501)
    }
    const order = url.searchParams.get('order')
    if (order !== null) {
      const [column = '', direction] = order.split('.')
      const sign = direction === 'desc' ? -1 : 1
      // Numbers as numbers, as Postgres does: as strings, line 10 sorts before line 9.
      const compare = (a: unknown, b: unknown) =>
        typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
      rows.sort((a, b) => sign * compare(a[column], b[column]))
    }
    const total = rows.length
    const limit = url.searchParams.get('limit')
    if (limit !== null) rows = rows.slice(0, Number(limit))
    const columns = (url.searchParams.get('select') ?? '*').split(',')
    const picked = columns.includes('*') ? rows : rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])))

    if (wantsObject) return picked.length === 1 ? json(picked[0]) : pgError('PGRST116', 406)
    const range = headers.get('prefer')?.includes('count=exact') === true ? { 'content-range': `0-${picked.length - 1}/${total}` } : {}
    return json(picked, 200, range)
  }

  const client = createClient('http://fake.supabase.test', 'fake-anon-key', {
    // A key per client: each test builds its own, and supabase-js warns when
    // two share one in the same window.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `fake-${clients++}` },
    global: { fetch: serve },
  })

  return { client, tables, rpcCalls, rpcReplies, fail: (t, code) => void failures.set(t, code) }
}
