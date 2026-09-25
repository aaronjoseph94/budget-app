import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VERSION, handle } from '../ai/index.js'

/**
 * Who the AI helper believes is calling. It asks Supabase's auth server,
 * with the caller's own token, and never takes a user from the body. Every
 * refusal is checked to happen before anything else is asked. The fetch is
 * a fake: nothing here reaches Supabase.
 */

const PROJECT = 'https://project.supabase.co'
const SITE = 'https://aaron-budget-app.pages.dev'
const USER = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455'
const TOKEN = 'Bearer caller-token-SECRETTOKEN'
const ENV = { SUPABASE_URL: PROJECT, SUPABASE_ANON_KEY: 'anon-key-for-tests' }

type Call = { url: string; init: RequestInit }
type Respond = (url: string) => Response | Promise<Response>
const signedIn: Respond = () => new Response(JSON.stringify({ id: USER, aud: 'authenticated' }), { status: 200 })

function request(opts: { method?: string; origin?: string | null; auth?: string | null; body?: unknown } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' })
  const origin = opts.origin === undefined ? SITE : opts.origin
  if (origin !== null) headers.set('origin', origin)
  const auth = opts.auth === undefined ? TOKEN : opts.auth
  if (auth !== null) headers.set('authorization', auth)
  const method = opts.method ?? 'POST'
  const body = opts.body === undefined ? { action: 'ping' } : opts.body
  return new Request(`${PROJECT}/functions/v1/ai`, {
    method,
    headers,
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  })
}

async function run(req: Request, env: Record<string, string | undefined> = ENV, respond: Respond = signedIn) {
  const calls: Call[] = []
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond(String(url))
  }) as typeof fetch
  const res = await handle(req, env, fetchFn)
  return { res, body: res.status === 204 ? null : await res.json(), calls }
}

describe('the AI helper refuses before asking anyone', () => {
  it('answers a preflight from the site with its CORS headers', async () => {
    const { res, calls } = await run(request({ method: 'OPTIONS' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE)
    expect(calls).toHaveLength(0)
  })

  it('refuses anything but POST, and a page on a foreign origin', async () => {
    const get = await run(request({ method: 'GET' }))
    expect([get.res.status, get.body]).toEqual([405, { ok: false, code: 'method_not_allowed' }])
    const foreign = await run(request({ origin: 'https://evil.example' }))
    expect([foreign.res.status, foreign.body.code]).toEqual([403, 'origin_not_allowed'])
    expect(foreign.res.headers.get('access-control-allow-origin')).toBeNull()
    expect([...get.calls, ...foreign.calls]).toHaveLength(0)
  })

  it('takes an extra https origin from EXTRA_ORIGINS and ignores one that is not', async () => {
    const env = { ...ENV, EXTRA_ORIGINS: ' https://budget.example.com , http://plain.example' }
    expect((await run(request({ origin: 'https://budget.example.com' }), env)).res.status).toBe(200)
    expect((await run(request({ origin: 'http://plain.example' }), env)).res.status).toBe(403)
  })

  it('refuses a request with no bearer token with 401', async () => {
    for (const auth of [null, 'Basic abc', 'Bearer ', 'caller-token']) {
      const { res, body, calls } = await run(request({ auth }))
      expect([res.status, body]).toEqual([401, { ok: false, code: 'not_signed_in' }])
      expect(calls).toHaveLength(0)
    }
  })

  it('refuses a body that is not JSON, an unknown action, or any field beyond the action', async () => {
    for (const body of ['not json', { action: 'chat' }, {}, { action: 'ping', url: 'https://evil.example' }, { action: 'ping', user_id: USER }]) {
      const { res, calls } = await run(request({ body }))
      expect(res.status).toBe(400)
      expect(calls).toHaveLength(0)
    }
  })
})

describe('the AI helper learns who is calling from the auth server', () => {
  it('asks /auth/v1/user with the caller’s own token and the public key, then answers ping', async () => {
    const { res, body, calls } = await run(request())
    expect([res.status, body]).toEqual([200, { ok: true, version: VERSION }])
    expect(calls.map((c) => c.url)).toEqual([`${PROJECT}/auth/v1/user`])
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe(TOKEN)
    expect(new Headers(calls[0]?.init.headers).get('apikey')).toBe('anon-key-for-tests')
  })

  it('says not_signed_in when the auth server refuses the token, or names no user', async () => {
    for (const respond of [
      () => new Response('{}', { status: 401 }),
      () => new Response('{}', { status: 403 }),
      () => new Response(JSON.stringify({ id: 'not-a-uuid' }), { status: 200 }),
    ]) {
      const { res, body } = await run(request(), ENV, respond)
      expect([res.status, body.code]).toEqual([401, 'not_signed_in'])
    }
  })

  it('says helper_error when it cannot ask, never that the caller is signed out', async () => {
    const down = await run(request(), ENV, () => Promise.reject(new Error('offline')))
    const broken = await run(request(), ENV, () => new Response('{}', { status: 500 }))
    const unset = await run(request(), { SUPABASE_ANON_KEY: 'x' })
    const bad = await run(request(), { ...ENV, SUPABASE_URL: 'https://evil.example/path' })
    for (const r of [down, broken, unset, bad]) expect([r.res.status, r.body.code]).toEqual([503, 'helper_error'])
    expect([...unset.calls, ...bad.calls]).toHaveLength(0)
  })
})

describe('the AI helper logs codes and counts only', () => {
  let lines: string[] = []
  beforeEach(() => {
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' ')))
  })
  afterEach(() => vi.restoreAllMocks())

  it('never logs the caller’s token or the public key, on any path', async () => {
    await run(request(), ENV, () => new Response('{}', { status: 500 }))
    await run(request(), ENV, () => Promise.reject(new Error('offline')))
    await run(request(), { SUPABASE_URL: PROJECT })
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line).not.toMatch(/SECRETTOKEN|anon-key/)
      expect(Object.keys(JSON.parse(line) as object).sort()).toEqual(expect.arrayContaining(['code', 'fn']))
    }
  })
})

describe('the AI helper can be pasted as one file', () => {
  it('imports zod by its pinned URL and nothing else, relative paths included', () => {
    const source = readFileSync(new URL('../ai/index.ts', import.meta.url), 'utf8')
    const specifiers = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(specifiers).toEqual(['npm:zod@4.6.5'])
  })
})
