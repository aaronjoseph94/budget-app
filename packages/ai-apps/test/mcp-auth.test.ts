import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CALL_TIMEOUT_MS } from '../src/auth.js'
import { DEADLINE_MS, handle } from '../src/handle.js'
import { AI_APP_CLAIMS, AI_APP_TOKEN, CLIENT, ENV, PROJECT, fakeFetch, signedIn, tokenWith, type Respond } from './fake-auth.js'

/**
 * The front door (PLAN §2.3, §2.13 mcp-auth): the metadata, the 401 that
 * points to it, and the token check, each refusal made before any tool.
 */

const RESOURCE = `${PROJECT}/functions/v1/mcp`
const METADATA = `${RESOURCE}/.well-known/oauth-protected-resource`

function call(auth: string | null, respond?: Respond, headers: Record<string, string> = {}, env: Record<string, string> = ENV) {
  const { fetchFn, calls } = fakeFetch(respond)
  const res = handle(
    new Request(`${PROJECT}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        ...(auth === null ? {} : { authorization: auth }),
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
    env,
    fetchFn,
  )
  return { res, calls }
}
const noFetch = fakeFetch().fetchFn

afterEach(() => {
  vi.useRealTimers()
})

describe('discovery', () => {
  it('serves the metadata with no token, naming the one authorization server', async () => {
    const res = await handle(new Request(`${PROJECT}/mcp/.well-known/oauth-protected-resource`), ENV, noFetch)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      resource: RESOURCE,
      authorization_servers: [`${PROJECT}/auth/v1`],
      scopes_supported: ['email'],
      bearer_methods_supported: ['header'],
    })
  })

  it('builds it from the environment, never from the request', async () => {
    const res = await handle(new Request('https://evil.example/mcp/.well-known/oauth-protected-resource'), ENV, noFetch)
    expect(((await res.json()) as { resource: string }).resource).toBe(RESOURCE)
  })

  it('answers only GET there', async () => {
    expect((await handle(new Request(METADATA, { method: 'POST' }), ENV, noFetch)).status).toBe(405)
  })
})

describe('the challenge', () => {
  it('answers no token with 401 and the exact metadata address', async () => {
    const { res, calls } = call(null)
    expect((await res).headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${METADATA}", scope="email"`)
    expect(calls).toEqual([])
  })

  it.each(['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer a b'])('answers "%s" as an invalid token', async (auth) => {
    const { res, calls } = call(auth)
    expect((await res).headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${METADATA}", scope="email", error="invalid_token"`)
    expect(calls).toEqual([])
  })

  it.each([401, 403])("turns Auth's %i into invalid_token", async (status) => {
    const r = await call(`Bearer ${AI_APP_TOKEN}`, () => new Response('{}', { status })).res
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toContain('error="invalid_token"')
  })
})

describe('the token check', () => {
  it('asks Auth with the caller\'s token and the anon key, and nothing else', async () => {
    const { res, calls } = call(`Bearer ${AI_APP_TOKEN}`)
    expect((await res).status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${PROJECT}/auth/v1/user`)
    expect(calls[0]?.init.headers).toEqual({ apikey: 'anon-key-for-tests', Authorization: `Bearer ${AI_APP_TOKEN}` })
    expect(calls[0]?.init.redirect).toBe('error')
  })

  it('asks Auth with the project\'s publishable key once it has one, so retiring the legacy keys signs no one out (backend-b-04)', async () => {
    const keys = { ...ENV, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_for_tests' }) }
    const { res, calls } = call(`Bearer ${AI_APP_TOKEN}`, undefined, {}, keys)
    expect((await res).status).toBe(200)
    expect(calls[0]?.init.headers).toEqual({ apikey: 'sb_publishable_for_tests', Authorization: `Bearer ${AI_APP_TOKEN}` })
    // An empty default, or JSON that is not an object of keys, falls back to the anon key.
    for (const bad of [JSON.stringify({ default: '' }), 'not json', '[]']) {
      const again = call(`Bearer ${AI_APP_TOKEN}`, undefined, {}, { ...ENV, SUPABASE_PUBLISHABLE_KEYS: bad })
      expect((await again.res).status).toBe(200)
      expect(again.calls[0]?.init.headers).toEqual({ apikey: 'anon-key-for-tests', Authorization: `Bearer ${AI_APP_TOKEN}` })
    }
    // The publishable key alone is enough to serve.
    const alone = call(`Bearer ${AI_APP_TOKEN}`, undefined, {}, { SUPABASE_URL: PROJECT, SUPABASE_PUBLISHABLE_KEYS: keys.SUPABASE_PUBLISHABLE_KEYS })
    expect((await alone.res).status).toBe(200)
    expect(alone.calls[0]?.init.headers).toEqual({ apikey: 'sb_publishable_for_tests', Authorization: `Bearer ${AI_APP_TOKEN}` })
  })

  it(`gives Auth ${CALL_TIMEOUT_MS / 1000} s, then lets the call go`, async () => {
    expect(CALL_TIMEOUT_MS).toBe(10_000)
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    try {
      const { res, calls } = call(`Bearer ${AI_APP_TOKEN}`)
      await res
      expect(timeout).toHaveBeenCalledWith(CALL_TIMEOUT_MS)
      expect(calls[0]?.init.signal).toBe(timeout.mock.results[0]?.value)
    } finally {
      timeout.mockRestore()
    }
  })

  it.each([
    ['Auth unreachable', () => Promise.reject(new TypeError('network'))],
    ['Auth failing', () => new Response('{}', { status: 500 })],
    ['a redirect from Auth, never followed', () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })],
  ] as [string, Respond][])('answers %s with 503', async (_, respond) => {
    const { res, calls } = call(`Bearer ${AI_APP_TOKEN}`, respond)
    expect((await res).status).toBe(503)
    expect(calls.map((c) => c.url)).toEqual([`${PROJECT}/auth/v1/user`])
  })

  it.each([
    ['another iss', { ...AI_APP_CLAIMS, iss: 'https://other.supabase.co/auth/v1' }],
    ['role anon', { ...AI_APP_CLAIMS, role: 'anon' }],
    ['role service_role', { ...AI_APP_CLAIMS, role: 'service_role' }],
    ['another subject than Auth names', { ...AI_APP_CLAIMS, sub: CLIENT }],
  ])('refuses a token with %s as invalid', async (_, claims) => {
    const r = await call(`Bearer ${tokenWith(claims)}`).res
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toContain('error="invalid_token"')
  })

  it('refuses a payload that cannot be read, and a user Auth does not name', async () => {
    expect((await call('Bearer e30.bm90IGpzb24.sig').res).status).toBe(401)
    expect((await call(`Bearer ${AI_APP_TOKEN}`, () => new Response('{"id":"nobody"}')).res).status).toBe(401)
  })

  it.each([
    ['no client_id', { ...AI_APP_CLAIMS, client_id: undefined }],
    ['a client_id that is not a UUID', { ...AI_APP_CLAIMS, client_id: 'claude' }],
  ])("refuses the owner's own sign-in (%s) with 403 and a plain message", async (_, claims) => {
    const r = await call(`Bearer ${tokenWith(claims)}`).res
    expect(r.status).toBe(403)
    expect(await r.json()).toMatchObject({ error: 'not_an_ai_app' })
  })

  it('refuses a disallowed Origin with 403 before asking Auth', async () => {
    const { res, calls } = call(`Bearer ${AI_APP_TOKEN}`, signedIn, { origin: 'https://evil.example' })
    expect((await res).status).toBe(403)
    expect(calls).toEqual([])
  })
})

describe('the deadline', () => {
  it(`gives up after ${DEADLINE_MS / 1000} s`, async () => {
    expect(DEADLINE_MS).toBe(20_000)
    vi.useFakeTimers()
    const { res } = call(`Bearer ${AI_APP_TOKEN}`, () => new Promise<Response>(() => undefined))
    await vi.advanceTimersByTimeAsync(DEADLINE_MS)
    const r = await res
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ error: 'deadline' })
  })

  // Testing mcp-02: for a 2025-era request the SDK hands back an event
  // stream before the tool runs, so racing only that let a tool run past
  // the deadline and still answer 200.
  it.each(['2025-06-18', '2025-11-25'])('gives up on a tool still running at %s too', async (version) => {
    vi.useFakeTimers()
    const { fetchFn } = fakeFetch((url, init) => (url.includes('/rest/') ? new Promise<Response>(() => undefined) : signedIn(url, init)))
    const res = handle(
      new Request(`${PROJECT}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': version, authorization: `Bearer ${AI_APP_TOKEN}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_categories', arguments: {} } }),
      }),
      ENV,
      fetchFn,
    )
    await vi.advanceTimersByTimeAsync(DEADLINE_MS)
    const r = await res
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ error: 'deadline' })
  })
})

describe('no service key', () => {
  it('is named nowhere in the source', () => {
    const dir = new URL('../src/', import.meta.url)
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .map((f) => f.replaceAll('\\', '/'))
      .filter((f) => f.endsWith('.ts'))
    expect(files).toContain('tools/categories.ts')
    const source = files.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n')
    expect(source).not.toMatch(/service_role|secret_keys|SUPABASE_SECRET|sb_secret_/i)
  })

  it('rides on no request: the only key sent is the anon key', async () => {
    const { res, calls } = call(`Bearer ${AI_APP_TOKEN}`)
    await res
    const sent = calls.flatMap((c) => Object.entries(c.init.headers as Record<string, string>))
    expect(sent).toEqual([
      ['apikey', 'anon-key-for-tests'],
      ['Authorization', `Bearer ${AI_APP_TOKEN}`],
    ])
  })
})
