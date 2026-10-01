import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handle } from '../src/handle.js'
import { AI_APP_CLAIMS, ENV, PROJECT, USER, fakeFetch, tokenWith, type Respond } from './fake-auth.js'
import { callTool, reply } from './fake-database.js'
import { READ } from './owner-rows.js'

/**
 * Nothing a caller or Supabase sends reaches a log line, and nothing in an
 * error body from Auth reaches a response (PLAN §2.6). A sentinel rides in
 * the token, the client's name, the arguments, and every body Auth
 * returns; every path the server has so far is run. Each read tool is run
 * below with it in every name the database hands back, and against a
 * database failing with words of its own.
 */

const SENTINEL = 'SENTINEL7c1e'
const TOKEN = tokenWith({ ...AI_APP_CLAIMS, email: `${SENTINEL}@example.com` }, `sig${SENTINEL}`)
const lines: string[] = []

beforeEach(() => {
  lines.length = 0
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack ?? ''}` : String(a))).join(' '))
    })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

const authSays = (status: number): Respond => () =>
  new Response(JSON.stringify({ id: USER, email: `${SENTINEL}@example.com`, msg: `error ${SENTINEL}` }), { status })

function post(body: unknown, auth: string | null, headers: Record<string, string> = {}): Request {
  return new Request(`${PROJECT}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...(auth === null ? {} : { authorization: auth }),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: `Claude ${SENTINEL}`, version: SENTINEL } } }
const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: `get_${SENTINEL}`, arguments: { what: SENTINEL } } }
const unknown = { jsonrpc: '2.0', id: 3, method: `budget/${SENTINEL}`, params: { what: SENTINEL } }

const PATHS: [string, Request, Respond][] = [
  ['initialize', post(initialize, `Bearer ${TOKEN}`), authSays(200)],
  ['a call to a tool that does not exist', post(call, `Bearer ${TOKEN}`), authSays(200)],
  ['an unknown method', post(unknown, `Bearer ${TOKEN}`), authSays(200)],
  ['a body that is not JSON', post(`{"${SENTINEL}":`, `Bearer ${TOKEN}`), authSays(200)],
  ['no token', post(call, null), authSays(200)],
  ['a token Auth refuses', post(call, `Bearer ${TOKEN}`), authSays(401)],
  ['Auth failing', post(call, `Bearer ${TOKEN}`), authSays(500)],
  ['Auth unreachable', post(call, `Bearer ${TOKEN}`), () => Promise.reject(new TypeError(`down ${SENTINEL}`))],
  ['the owner\'s own sign-in', post(call, `Bearer ${tokenWith({ ...AI_APP_CLAIMS, client_id: null, name: SENTINEL })}`), authSays(200)],
  ['another iss', post(call, `Bearer ${tokenWith({ ...AI_APP_CLAIMS, iss: SENTINEL })}`), authSays(200)],
  ['a refused origin', post(call, `Bearer ${TOKEN}`, { origin: `https://${SENTINEL}.example` }), authSays(200)],
]

describe('logs carry codes and counts only', () => {
  it.each(PATHS)('%s', async (_, req, respond) => {
    const res = await handle(req, ENV, fakeFetch(respond).fetchFn)
    const body = await res.text()
    expect(lines.filter((l) => l.includes(SENTINEL))).toEqual([])
    // Our own lines are JSON with a code and numbers, nothing more.
    for (const line of lines.filter((l) => l.startsWith('{"fn":"mcp"'))) {
      const { fn, code, ...counts } = JSON.parse(line) as Record<string, unknown>
      expect([fn, typeof code]).toEqual(['mcp', 'string'])
      expect(Object.values(counts).every((v) => typeof v === 'number')).toBe(true)
    }
    // Nothing Auth said in an error reaches the AI app.
    expect(body.includes(`error ${SENTINEL}`) || body.includes(`down ${SENTINEL}`)).toBe(false)
  })

  it('logs the refusals it makes, by code', async () => {
    await handle(post(call, `Bearer ${TOKEN}`), ENV, fakeFetch(authSays(401)).fetchFn)
    await handle(post(call, `Bearer ${TOKEN}`), ENV, fakeFetch(authSays(500)).fetchFn)
    expect(lines).toEqual(['{"fn":"mcp","code":"token_refused","check":1}', '{"fn":"mcp","code":"auth_status","status":500}'])
  })
})

// Every name the database can hand back carries the sentinel: a category, a shop, a goal, a debt.
const named = JSON.parse(JSON.stringify(READ).replace(/"(Groceries|Rent|Pay|FRESHCO|PAYROLL)"/g, `"$1 ${SENTINEL}"`)) as typeof READ
const goal = { id: 'g1', name: `Trip ${SENTINEL}`, target_cents: 200000, saved_cents: 5000, target_date: null, unit_cost_cents: 27500, unit_label: SENTINEL, created_at: SENTINEL, sort_order: 0, status: 'active', reached_on: null, category_id: null, start_date: null, balance_as_of: null }
const row = { posted_on: '2026-09-29', amount_cents: -1275, merchant_raw: `SHOP ${SENTINEL}`, category: `Food ${SENTINEL}`, kind: 'variable', category_source: 'model', source: 'ai_app', ai_client_id: null }
const EVERYTHING = {
  ...named,
  goals: [goal],
  fund_txns: [],
  debts: [{ id: 'd1', name: `Car ${SENTINEL}`, starting_balance_cents: 100000, minimum_payment_cents: 10000, apr_basis_points: 0, start_date: '2026-07-01', sort_order: 0 }],
  debt_extras: [],
  not_subscriptions: [],
  total: 1,
  rows: [row],
  all: [row],
  waiting: 1,
  unreadable_lines: 0,
  account: 'aaaaaaaa-0000-4000-8000-000000000001',
  status: 'added',
}
const TOOLS: [string, Record<string, unknown>][] = [
  ['list_categories', {}],
  ['get_period', { period: 'month' }],
  ['get_spending', { question: 'top_shops' }],
  ['get_debts', { debt: `Car ${SENTINEL}` }],
  ['get_forecast', { what_if_monthly_saving: '50' }],
  ['get_savings_goals', {}],
  ['search_transactions', { text: SENTINEL, categories: [`Groceries ${SENTINEL}`] }],
  ['list_review_queue', {}],
  ['add_expense', { amount: '12.50', what: `Lunch ${SENTINEL}`, category: `Groceries ${SENTINEL}` }],
  ['add_note', { text: `Lunch ${SENTINEL} 12.50 yesterday`, category: `Groceries ${SENTINEL}` }],
]

describe('the tools log codes and counts only', () => {
  it.each(TOOLS)('%s, with names in every row', async (name, args) => {
    const { result } = await callTool(() => reply(EVERYTHING), name, args)
    expect(result.isError).toBeUndefined()
    expect(lines.filter((l) => l.includes(SENTINEL))).toEqual([])
    expect(lines.some((l) => l.includes(`"code":"tool_${name}_ok"`))).toBe(true)
  })

  it.each(TOOLS)('%s, when the database fails with words of its own', async (name, args) => {
    const { result } = await callTool(() => reply({ message: `error ${SENTINEL}` }, 500), name, args)
    expect(JSON.stringify(result).includes(`error ${SENTINEL}`)).toBe(false)
    expect(lines.filter((l) => l.includes(SENTINEL))).toEqual([])
  })
})
