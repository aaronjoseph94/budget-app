import { describe, expect, it } from 'vitest'
import { MCP_SERVER_VERSION } from '@budget/schema'
import { handle as serve } from '../src/handle.js'
import { AI_APP_TOKEN, ENV, PROJECT, fakeFetch } from './fake-auth.js'

/**
 * The AI apps server speaks MCP through the official SDK (PLAN §2.13,
 * mcp-protocol): both protocol eras, the 64 KB bound, and nothing
 * cacheable, for an AI app Auth accepts. No tool is registered yet (M5b
 * adds the first).
 */

const handle = (req: Request, env: typeof ENV) => serve(req, env, fakeFetch().fetchFn)
const MODERN = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${PROJECT}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${AI_APP_TOKEN}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const modern = (method: string) =>
  post({ jsonrpc: '2.0', id: 1, method, params: { _meta: MODERN } }, { 'mcp-protocol-version': '2026-07-28', 'mcp-method': method })

const legacy = (method: string, params?: unknown, id: number | null = 1) =>
  post({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, ...(params === undefined ? {} : { params }) }, { 'mcp-protocol-version': '2025-06-18' })

const initialize = (version: string) =>
  legacy('initialize', { protocolVersion: version, capabilities: {}, clientInfo: { name: 'c', version: '1' } })

/** A 2025 reply may come as one server-sent event; a 2026 reply is plain JSON. */
async function message(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  const data = /^data: (.*)$/m.exec(text)
  return JSON.parse(data?.[1] ?? text) as Record<string, unknown>
}

describe('the MCP endpoint', () => {
  it.each(['2025-06-18', '2025-11-25'])('answers initialize at %s', async (version) => {
    const res = await handle(initialize(version), ENV)
    expect(res.status).toBe(200)
    const reply = await message(res)
    expect(reply.result).toMatchObject({ protocolVersion: version, serverInfo: { name: 'budget', version: MCP_SERVER_VERSION } })
  })

  it('accepts notifications/initialized with 202', async () => {
    expect((await handle(legacy('notifications/initialized', undefined, null), ENV)).status).toBe(202)
  })

  it('answers server/discover at 2026-07-28 as one JSON body', async () => {
    const res = await handle(modern('server/discover'), ENV)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect((await message(res)).result).toMatchObject({ supportedVersions: ['2026-07-28'], capabilities: { tools: {} } })
  })

  it('lists the same tools in both eras, with a zero cache hint', async () => {
    const names = (reply: Record<string, unknown>) => (reply.result as { tools: { name: string }[] }).tools.map((t) => t.name)
    expect(names(await message(await handle(legacy('tools/list'), ENV)))).toEqual(['list_categories', 'get_period', 'get_spending', 'get_forecast', 'get_savings_goals', 'get_debts', 'search_transactions', 'list_review_queue'])
    const now = await message(await handle(modern('tools/list'), ENV))
    expect(names(now)).toEqual(['list_categories', 'get_period', 'get_spending', 'get_forecast', 'get_savings_goals', 'get_debts', 'search_transactions', 'list_review_queue'])
    expect(now.result).toMatchObject({ ttlMs: 0, cacheScope: 'private' })
  })

  // The SDK answers a tool's refused arguments as an error result, not -32602.
  it('refuses arguments a tool does not take, naming no value', async () => {
    const reply = await message(await handle(legacy('tools/call', { name: 'list_categories', arguments: { sneaky: 'VALUE-7' } }), ENV))
    expect(reply.result).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringMatching(/^Input validation error/) }] })
    expect(JSON.stringify(reply)).not.toContain('VALUE-7')
  })

  it('answers an unknown method with -32601, in both eras', async () => {
    expect((await message(await handle(legacy('budget/nothing'), ENV))).error).toMatchObject({ code: -32601 })
    expect((await message(await handle(modern('budget/nothing'), ENV))).error).toMatchObject({ code: -32601 })
  })

  it('refuses a body over 64 KB with 413, and takes one just under', async () => {
    expect((await handle(post('x'.repeat(64 * 1024 + 1)), ENV)).status).toBe(413)
    const padded = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: '' } }
    padded.params.pad = 'x'.repeat(64 * 1024 - JSON.stringify(padded).length)
    expect((await handle(post(padded, { 'mcp-protocol-version': '2025-06-18' }), ENV)).status).toBe(200)
  })

  it('marks every SDK response no-store, whatever the SDK sent', async () => {
    const replies = [
      await handle(initialize('2025-06-18'), ENV),
      await handle(legacy('notifications/initialized', undefined, null), ENV),
      await handle(modern('server/discover'), ENV),
      await handle(post('x'.repeat(65 * 1024)), ENV),
    ]
    expect(replies.map((r) => r.headers.get('cache-control'))).toEqual(['no-store', 'no-store', 'no-store', 'no-store'])
  })
})
