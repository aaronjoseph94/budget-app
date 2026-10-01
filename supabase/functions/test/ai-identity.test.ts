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
const TOKEN = 'Bearer e30.e30.caller-token-SECRETTOKEN'
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

  it('says not_signed_in to the public anon key, which the auth server names no user for', async () => {
    const anon: Respond = () => new Response(JSON.stringify({ code: 403, msg: 'invalid claim: missing sub claim' }), { status: 403 })
    const { res, body, calls } = await run(request({ auth: 'Bearer e30.e30.anon-key-for-tests' }), ENV, anon)
    expect([res.status, body]).toEqual([401, { ok: false, code: 'not_signed_in' }])
    expect(calls.map((c) => c.url)).toEqual([`${PROJECT}/auth/v1/user`])
  })

  // An AI app the owner connected (ADR 0012) must never spend the owner's AI keys.
  it('says not_signed_in to an AI app’s token, which carries client_id, even when the auth server accepts it', async () => {
    const claims = (c: object) => `Bearer e30.${Buffer.from(JSON.stringify(c)).toString('base64url')}.sig`
    for (const auth of [claims({ sub: USER, client_id: '0a1b2c3d-4e5f-4a6b-8c7d-99aabbccddee' }), claims({ client_id: '' }), 'Bearer e30.not-json.sig', 'Bearer no-payload']) {
      const { res, body, calls } = await run(request({ auth, body: { action: 'status' } }))
      expect([auth, res.status, body]).toEqual([auth, 401, { ok: false, code: 'not_signed_in' }])
      expect(calls.map((c) => c.url)).toEqual([`${PROJECT}/auth/v1/user`])
    }
    expect((await run(request({ auth: claims({ sub: USER, client_id: null }) }))).res.status).toBe(200)
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

describe('the AI helper asks the auth server with the project’s public key (backend-b-04)', () => {
  const apikeyOf = (c: Call | undefined) => new Headers(c?.init.headers).get('apikey')
  const PUBLISHABLE = JSON.stringify({ default: 'sb_publishable_notarealkey0001' })

  it('uses the new publishable key when Supabase gives one, with the legacy anon key off', async () => {
    const only = await run(request(), { SUPABASE_URL: PROJECT, SUPABASE_PUBLISHABLE_KEYS: PUBLISHABLE })
    expect([only.res.status, only.body.ok]).toEqual([200, true])
    expect(apikeyOf(only.calls[0])).toBe('sb_publishable_notarealkey0001')
    const both = await run(request(), { ...ENV, SUPABASE_PUBLISHABLE_KEYS: PUBLISHABLE })
    expect(apikeyOf(both.calls[0])).toBe('sb_publishable_notarealkey0001')
  })

  it('falls back to the legacy anon key when the publishable keys are missing or unreadable', async () => {
    for (const keys of [undefined, 'not json', '{"default":""}', '{"other":"sb_publishable_x"}']) {
      const r = await run(request(), { ...ENV, SUPABASE_PUBLISHABLE_KEYS: keys })
      expect(apikeyOf(r.calls[0]), String(keys)).toBe('anon-key-for-tests')
    }
    const none = await run(request(), { SUPABASE_URL: PROJECT, SUPABASE_PUBLISHABLE_KEYS: 'not json' })
    expect([none.res.status, none.body.code, none.calls.length]).toEqual([503, 'helper_error', 0])
  })
})

describe('the AI helper reaches the database as itself, for the caller alone', () => {
  const LEGACY = ['header', 'payload', 'signature'].join('.') // a legacy key's three-part shape, and nothing a scanner could take for one
  const FRESH = 'sb_secret_notarealkey0001'
  const context = { settings: { daily_cap: 40, models: {} }, keys: [], usage: [] }
  const withDb: Respond = (url) => (url.endsWith('/auth/v1/user') ? signedIn(url) : new Response(JSON.stringify(context)))
  const dbCall = async (env: Record<string, string | undefined>) => {
    const { res, calls } = await run(request({ body: { action: 'status' } }), { ...ENV, ...env }, withDb)
    expect(res.status).toBe(200)
    const call = calls.find((c) => c.url === `${PROJECT}/rest/v1/rpc/ai_context_for`)
    return { headers: new Headers(call?.init.headers), args: JSON.parse(String(call?.init.body)) as unknown }
  }

  it('asks for the user the auth server named, and no other', async () => {
    expect((await dbCall({ SUPABASE_SERVICE_ROLE_KEY: LEGACY })).args).toEqual({ p_user: USER })
    // A second caller is asked for as themselves, so no one id is built in.
    const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-99aabbccddee'
    const other: Respond = (url) =>
      url.endsWith('/auth/v1/user') ? new Response(JSON.stringify({ id: OTHER.toUpperCase() })) : new Response(JSON.stringify(context))
    const { calls } = await run(request({ body: { action: 'status' } }), { ...ENV, SUPABASE_SERVICE_ROLE_KEY: LEGACY }, other)
    const call = calls.find((c) => c.url.endsWith('/rpc/ai_context_for'))
    expect(JSON.parse(String(call?.init.body))).toEqual({ p_user: OTHER })
  })

  it('sends a legacy service_role JWT as the apikey and as the bearer', async () => {
    const { headers } = await dbCall({ SUPABASE_SERVICE_ROLE_KEY: LEGACY })
    expect([headers.get('apikey'), headers.get('authorization')]).toEqual([LEGACY, `Bearer ${LEGACY}`])
  })

  it('sends a new sb_secret_ key as the apikey only, never as a bearer, and prefers it', async () => {
    const { headers } = await dbCall({ SUPABASE_SERVICE_ROLE_KEY: LEGACY, SUPABASE_SECRET_KEYS: JSON.stringify({ default: FRESH }) })
    expect([headers.get('apikey'), headers.get('authorization')]).toEqual([FRESH, null])
  })

  it('falls back to the legacy key when the new keys cannot be read', async () => {
    for (const keys of ['not json', '{"other":"sb_secret_x"}', '{"default":""}']) {
      expect((await dbCall({ SUPABASE_SERVICE_ROLE_KEY: LEGACY, SUPABASE_SECRET_KEYS: keys })).headers.get('apikey')).toBe(LEGACY)
    }
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
