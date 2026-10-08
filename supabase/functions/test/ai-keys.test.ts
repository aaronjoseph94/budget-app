import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiKeyReply } from '@budget/schema'
import { handle, sealKey } from '../ai/index.js'

/**
 * save_key and test_key (plan A10): a pasted key is tested on Gemini's list
 * endpoint, kept sealed only when it works or Google is busy, and never
 * sent back or logged. The fake answers the auth server, 0016's functions
 * and Google; the key is obviously not a real one.
 */

const PROJECT = 'https://project.supabase.co'
const USER = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455'
const LEGACY = ['header', 'payload', 'signature'].join('.')
const ENV = { SUPABASE_URL: PROJECT, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: LEGACY }
const KEY = 'test-not-a-real-key-0001'
const SECRET = 'test-not-a-real-secret-0002'
const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'

const listing = () =>
  new Response(
    JSON.stringify({
      models: [
        { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-not-on-the-list', supportedGenerationMethods: ['generateContent'] },
      ],
    }),
  )
const invalid = () => new Response(JSON.stringify({ error: { code: 400, details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400 })
const busy = () => new Response('{}', { status: 429 })

type Call = { url: string; init: RequestInit }
interface World {
  google?: () => Response
  db?: Record<string, () => Response>
  keys?: unknown[]
}

async function ask(body: unknown, world: World = {}, env: Record<string, string | undefined> = ENV) {
  const calls: Call[] = []
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init: init ?? {} })
    if (u.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: USER }))
    if (!u.startsWith(PROJECT)) return (world.google ?? listing)()
    const fn = u.slice(`${PROJECT}/rest/v1/rpc/`.length)
    const answer = world.db?.[fn]
    if (answer !== undefined) return answer()
    if (fn === 'ai_context_for') return new Response(JSON.stringify({ settings: { daily_cap: 40, models: {} }, keys: world.keys ?? [], usage: [] }))
    return new Response(fn === 'ai_key_mark' ? 'true' : null, { status: fn === 'ai_key_mark' ? 200 : 204 })
  }) as typeof fetch
  const req = new Request(`${PROJECT}/functions/v1/ai`, {
    method: 'POST',
    headers: { authorization: 'Bearer e30.e30.caller-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await handle(req, env, fetchFn)
  const text = await res.text()
  const rpc = (fn: string) => calls.filter((c) => c.url === `${PROJECT}/rest/v1/rpc/${fn}`).map((c) => JSON.parse(String(c.init.body)) as Record<string, unknown>)
  return { res, text, body: JSON.parse(text) as AiKeyReply & { code?: string }, calls, rpc }
}
const save = (world?: World, env?: Record<string, string | undefined>) => ask({ action: 'save_key', provider: 'gemini', key: KEY }, world, env)
const test = (world?: World, env?: Record<string, string | undefined>) => ask({ action: 'test_key', provider: 'gemini' }, world, env)

let lines: string[] = []
beforeEach(() => {
  lines = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' ')))
})
afterEach(() => vi.restoreAllMocks())

describe('save_key', () => {
  it('tests the key on Google’s list, stores it sealed, and answers with its last four characters and the models it can use', async () => {
    const { res, body, calls, rpc } = await save()
    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true, provider: 'gemini', source: 'saved', status: 'ok', hint: '0001',
      models: [
        { id: 'gemini-3.5-flash-lite', listed: true },
        { id: 'gemini-3.1-flash-lite', listed: true },
        // On the committed list but not offered to this key: shown, not ticked.
        { id: 'gemini-3.5-flash', listed: false },
      ],
    })
    const google = calls.find((c) => c.url === GOOGLE)
    expect(new Headers(google?.init.headers).get('x-goog-api-key')).toBe(KEY)
    const [put] = rpc('ai_key_put')
    expect(put).toMatchObject({ p_user: USER, p_provider: 'gemini', p_key_v: 1, p_key_hint: '0001', p_status: 'ok', p_model: null })
    expect(String(put?.['p_kek_id'])).toMatch(/^[0-9a-f]{16}$/)
    expect(JSON.stringify(put)).not.toContain('real-key')
  })

  it('never stores a key Google turned down', async () => {
    const { res, body, rpc } = await save({ google: invalid })
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, provider: 'gemini', source: 'none', status: 'rejected', hint: null, models: [] })
    expect(rpc('ai_key_put')).toEqual([])
  })

  it('stores a key when Google is busy, marked busy, to be tried again', async () => {
    for (const google of [busy, () => new Response('{}', { status: 503 })]) {
      const { body, rpc } = await save({ google })
      expect(body).toMatchObject({ source: 'saved', status: 'busy', hint: '0001', models: [] })
      expect(rpc('ai_key_put')[0]).toMatchObject({ p_status: 'busy' })
    }
  })

  it('refuses a key of the wrong shape before asking anyone', async () => {
    for (const key of ['short', `${KEY} `, 'test-not-a-real-key/0001']) {
      const { res, calls } = await ask({ action: 'save_key', provider: 'gemini', key })
      expect([res.status, calls]).toEqual([400, []])
    }
    expect((await ask({ action: 'save_key', provider: 'mistral', key: KEY })).res.status).toBe(400)
  })

  it('asks Google nothing when there is no root to seal the key with', async () => {
    const { res, body, calls } = await save({}, { SUPABASE_URL: PROJECT, SUPABASE_ANON_KEY: 'anon' })
    expect([res.status, body.code]).toEqual([503, 'helper_error'])
    expect(calls.map((c) => c.url)).toEqual([`${PROJECT}/auth/v1/user`])
  })

  it('says needs_update when 0016 is not in yet', async () => {
    const missing = () => new Response(JSON.stringify({ code: 'PGRST202' }), { status: 404 })
    const { res, body } = await save({ db: { ai_key_put: missing } })
    expect([res.status, body]).toEqual([503, { ok: false, code: 'needs_update' }])
  })
})

describe('a key for another service', () => {
  const GROQ = 'https://api.groq.com/openai/v1/models'
  const groqList = () => new Response(JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }] }))

  it('is tested on that service’s list, sealed for that service, and answered with its own models', async () => {
    const { body, calls, rpc } = await ask({ action: 'save_key', provider: 'groq', key: KEY }, { db: {}, google: groqList })
    expect(calls.some((c) => c.url === GOOGLE)).toBe(false)
    expect(body).toEqual({
      ok: true, provider: 'groq', source: 'saved', status: 'ok', hint: '0001',
      models: [{ id: 'openai/gpt-oss-20b', listed: false }, { id: 'openai/gpt-oss-120b', listed: true }, { id: 'qwen/qwen3.8-27b', listed: false }],
    })
    expect(new Headers(calls.find((c) => c.url === GROQ)?.init.headers).get('authorization')).toBe(`Bearer ${KEY}`)
    expect(rpc('ai_key_put')[0]).toMatchObject({ p_provider: 'groq', p_status: 'ok' })
  })

  it('never uses the Gemini secret: with no pasted key the service is not set up', async () => {
    const { res, body, calls } = await ask({ action: 'test_key', provider: 'openai' }, {}, { ...ENV, GEMINI_API_KEY: SECRET })
    expect([res.status, body]).toEqual([409, { ok: false, code: 'not_set_up' }])
    expect(calls.some((c) => !c.url.startsWith(PROJECT))).toBe(false)
  })

  it('does not open for another service: a Gemini key saved under Groq is locked', async () => {
    const sealed = await sealKey(ENV, USER, 'gemini', KEY)
    const { body } = await ask({ action: 'test_key', provider: 'groq' }, { keys: [{ provider: 'groq', ...sealed, key_hint: '0001', status: 'ok' }] })
    expect(body).toMatchObject({ provider: 'groq', status: 'locked' })
  })
})

describe('test_key, which is also Check which models work', () => {
  const savedRow = async (env: Record<string, string | undefined> = ENV) => {
    const sealed = await sealKey(env, USER, 'gemini', KEY)
    return { provider: 'gemini', ...sealed, key_hint: '0001', status: 'busy', model: null }
  }

  it('opens the saved key, tests it, and marks what it found', async () => {
    const { body, calls, rpc } = await test({ keys: [await savedRow()] })
    expect(body).toMatchObject({ source: 'saved', status: 'ok', hint: '0001' })
    expect(body.models.filter((m) => m.listed).map((m) => m.id)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])
    expect(new Headers(calls.find((c) => c.url === GOOGLE)?.init.headers).get('x-goog-api-key')).toBe(KEY)
    expect(rpc('ai_key_mark')).toEqual([{ p_user: USER, p_provider: 'gemini', p_status: 'ok' }])
  })

  it('marks a saved key rejected when Google now turns it down', async () => {
    const { body, rpc } = await test({ keys: [await savedRow()], google: invalid })
    expect(body).toMatchObject({ source: 'saved', status: 'rejected', models: [] })
    expect(rpc('ai_key_mark')[0]).toMatchObject({ p_status: 'rejected' })
  })

  it('says locked, and asks Google nothing, when the root that sealed the key has changed', async () => {
    const row = await savedRow({ SUPABASE_SERVICE_ROLE_KEY: ['header', 'payload', 'old'].join('.') })
    const { res, body, calls, rpc } = await test({ keys: [row] })
    expect([res.status, body.status, body.hint]).toEqual([200, 'locked', '0001'])
    expect(calls.some((c) => c.url === GOOGLE)).toBe(false)
    expect(rpc('ai_key_mark')[0]).toMatchObject({ p_status: 'locked' })
  })

  it('tests the Gemini secret when no key was pasted, and marks nothing', async () => {
    const { body, calls, rpc } = await test({}, { ...ENV, GEMINI_API_KEY: SECRET })
    expect(body).toMatchObject({ source: 'secret', status: 'ok', hint: '0002' })
    expect(new Headers(calls.find((c) => c.url === GOOGLE)?.init.headers).get('x-goog-api-key')).toBe(SECRET)
    expect(rpc('ai_key_mark')).toEqual([])
  })

  it('says not_set_up when there is neither a pasted key nor the secret', async () => {
    const { res, body } = await test()
    expect([res.status, body]).toEqual([409, { ok: false, code: 'not_set_up' }])
  })
})

describe('a key goes one way', () => {
  it('appears in no reply and no log line, on any path', async () => {
    const replies = [
      await save(), await save({ google: invalid }), await save({ google: busy }),
      await test({}, { ...ENV, GEMINI_API_KEY: SECRET }),
    ]
    for (const r of replies) expect(r.text).not.toMatch(/real-key|real-secret/)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line).not.toMatch(/real-key|real-secret|header\.payload/)
      expect(Object.keys(JSON.parse(line) as object).sort()).toEqual(['code', 'fn'])
    }
  })
})
