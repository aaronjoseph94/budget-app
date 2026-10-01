import { afterEach, describe, expect, it, vi } from 'vitest'
import { MCP_SERVER_VERSION } from '@budget/schema'
import { handle as serve } from '../src/handle.js'

/**
 * What the AI apps server answers around the MCP endpoint itself (PLAN
 * §2.2): its paths and methods, the origins it lets in, /mcp/health, and
 * how the pasted file starts under Deno.
 */

const PROJECT = 'https://project.supabase.co'
const ENV = { SUPABASE_URL: PROJECT, SUPABASE_ANON_KEY: 'anon-key-for-tests' }
const SITE = 'https://aaron-budget-app.pages.dev'
/** Nothing here may reach Supabase. */
const noFetch = (() => Promise.reject(new Error('no fetch expected'))) as typeof fetch
const handle = (req: Request, env: Record<string, string>) => serve(req, env, noFetch)
const at = (path: string, init: RequestInit = {}) => new Request(`${PROJECT}${path}`, init)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('paths and methods', () => {
  it.each(['GET', 'DELETE', 'PUT'])('answers %s on /mcp with 405', async (method) => {
    const res = await handle(at('/mcp', { method }), ENV)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })

  it('says not_configured, and serves nothing, without the project address', async () => {
    const res = await handle(at('/mcp', { method: 'POST', body: '{}' }), {})
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not_configured' })
  })

  it('knows nothing of other paths', async () => {
    expect((await handle(at('/mcp/other'), ENV)).status).toBe(404)
    expect((await handle(at('/other'), ENV)).status).toBe(404)
  })

  it('marks every response no-store', async () => {
    const replies = [
      await handle(at('/mcp', { method: 'GET' }), ENV),
      await handle(at('/mcp/health'), ENV),
      await handle(at('/mcp/health', { method: 'OPTIONS', headers: { origin: SITE } }), ENV),
      await handle(at('/mcp', { headers: { origin: 'https://evil.example' } }), ENV),
      await handle(at('/nowhere'), ENV),
    ]
    expect(replies.map((r) => r.headers.get('cache-control'))).toEqual(Array(replies.length).fill('no-store'))
  })
})

describe('origins', () => {
  it('refuses a browser page on another origin with 403', async () => {
    const res = await handle(at('/mcp', { method: 'POST', body: '{}', headers: { origin: 'https://evil.example' } }), ENV)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'origin_not_allowed' })
  })

  it('lets exact https origins in EXTRA_ORIGINS through, and nothing else from it', async () => {
    const env = { ...ENV, EXTRA_ORIGINS: 'https://budget.example, http://not-https.example' }
    const ok = await handle(at('/mcp/health', { headers: { origin: 'https://budget.example' } }), env)
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://budget.example')
    const plain = await handle(at('/mcp/health', { headers: { origin: 'http://not-https.example' } }), env)
    expect(plain.status).toBe(403)
  })
})

describe('/mcp/health', () => {
  it('says the version and the tool count, with no token', async () => {
    const res = await handle(at('/functions/v1/mcp/health', { headers: { origin: SITE } }), ENV)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, version: MCP_SERVER_VERSION, tools: 7 })
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE)
    const bare = await handle(at('/mcp/health'), ENV)
    expect(bare.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers a preflight, and nothing but GET', async () => {
    const pre = await handle(at('/mcp/health', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }), ENV)
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS')
    expect(pre.headers.get('access-control-allow-headers')).toBe('authorization, x-client-info, apikey, content-type')
    expect((await handle(at('/mcp/health', { method: 'POST' }), ENV)).status).toBe(405)
  })
})

describe('under Deno', () => {
  it('serves handle with only the names it reads', async () => {
    let served: ((req: Request) => Response | Promise<Response>) | undefined
    const asked: string[] = []
    vi.stubGlobal('Deno', {
      env: { get: (name: string) => (asked.push(name), name === 'SUPABASE_URL' ? PROJECT : undefined) },
      serve: (fn: (req: Request) => Response | Promise<Response>) => {
        served = fn
      },
    })
    await import('../src/deno.js')
    const res = await served?.(at('/mcp/health'))
    expect(res?.status).toBe(200)
    expect(asked.sort()).toEqual(['EXTRA_ORIGINS', 'SUPABASE_ANON_KEY', 'SUPABASE_URL'])
  })
})
