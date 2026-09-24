import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseReceiptReply } from '@budget/schema'
import { handle } from '../read-receipt/index.js'

/**
 * read-receipt holds the Gemini key, so every refusal is checked to happen
 * before the key is spent, and every answer to carry nothing but a code or
 * the model's reply text. The fetch is a fake: nothing here reaches Google.
 */

const KEY = 'test-not-a-real-key-0001'
const ENV = { GEMINI_API_KEY: KEY }
const SITE = 'https://aaron-budget-app.pages.dev'
// A marker in the image, so a log line that carried it would be caught.
const IMAGE = 'SECRETIMAGEBYTES' + 'A'.repeat(200)
const REPLY = '{"readable":true,"merchant":"SYNTHETIC CAFE","total":"14.23","date":"2026-09-20"}'

type Call = { url: string; init: RequestInit }
function fakeFetch(respond: Respond) {
  const calls: Call[] = []
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond()
  }) as typeof fetch
  return { fn, calls }
}
const gemini = (text: unknown = REPLY) => () =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] }, safetyRatings: [{ category: 'X' }] }],
      usageMetadata: { promptTokenCount: 7 },
    }),
    { status: 200 },
  )

function request(opts: { method?: string; origin?: string | null; auth?: string | null; body?: unknown } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' })
  const origin = opts.origin === undefined ? SITE : opts.origin
  if (origin !== null) headers.set('origin', origin)
  const auth = opts.auth === undefined ? 'Bearer user-token' : opts.auth
  if (auth !== null) headers.set('authorization', auth)
  const method = opts.method ?? 'POST'
  const body = opts.body === undefined ? { image: IMAGE, mimeType: 'image/jpeg' } : opts.body
  return new Request('https://project.supabase.co/functions/v1/read-receipt', {
    method,
    headers,
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  })
}

type Respond = () => Response | Promise<Response>
async function run(req: Request, env: Record<string, string | undefined> = ENV, respond: Respond = gemini()) {
  const f = fakeFetch(respond)
  const res = await handle(req, env, f.fn)
  return { res, body: res.status === 204 ? null : await res.json(), calls: f.calls }
}

describe('read-receipt refuses before spending the key', () => {
  it('answers a preflight from the site with its CORS headers', async () => {
    const { res, calls } = await run(request({ method: 'OPTIONS' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE)
    expect(calls).toHaveLength(0)
  })

  it('refuses anything but POST', async () => {
    const { res, body } = await run(request({ method: 'GET' }))
    expect([res.status, body.code]).toEqual([405, 'method_not_allowed'])
  })

  it('refuses a page on a foreign origin, with no CORS header for it', async () => {
    const { res, body, calls } = await run(request({ origin: 'https://evil.example' }))
    expect([res.status, body.code]).toEqual([403, 'origin_not_allowed'])
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('takes an extra https origin from EXTRA_ORIGINS and ignores one that is not', async () => {
    const env = { ...ENV, EXTRA_ORIGINS: ' https://budget.example.com , http://plain.example, javascript:x' }
    expect((await run(request({ origin: 'https://budget.example.com' }), env)).res.status).toBe(200)
    expect((await run(request({ origin: 'http://plain.example' }), env)).res.status).toBe(403)
  })

  it('refuses a request with no bearer token', async () => {
    for (const auth of [null, 'Basic abc']) {
      const { res, body, calls } = await run(request({ auth }))
      expect([res.status, body.code]).toEqual([401, 'not_signed_in'])
      expect(calls).toHaveLength(0)
    }
  })

  it('says not_configured with no key, an empty key, or a model name that is not a Gemini id', async () => {
    const envs = [{}, { GEMINI_API_KEY: '' }, { ...ENV, GEMINI_MODEL: 'evil.example/x' }, { ...ENV, GEMINI_MODEL: '' }]
    for (const env of envs) {
      const { res, body, calls } = await run(request(), env)
      expect([res.status, body.code]).toEqual([503, 'not_configured'])
      expect(calls).toHaveLength(0)
    }
  })

  it('refuses a body that is not JSON, or not a small base64 image of an allowed type', async () => {
    const bodies = ['not json', { image: IMAGE }, { image: IMAGE, mimeType: 'image/gif' }, { image: 'short', mimeType: 'image/png' }, { image: IMAGE + '<', mimeType: 'image/png' }]
    for (const body of bodies) {
      const { res, body: out, calls } = await run(request({ body }))
      expect([res.status, out.code]).toEqual([400, 'bad_request'])
      expect(calls).toHaveLength(0)
    }
  })
})

describe('read-receipt calls one fixed host and passes on only the reply text', () => {
  it('sends the image to the fixed Gemini endpoint with the key in its header', async () => {
    const { res, body, calls } = await run(request({ origin: null }))
    expect([res.status, body]).toEqual([200, { ok: true, reply: REPLY }])
    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call?.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    expect(call?.init.method).toBe('POST')
    expect(call?.init.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': KEY })
    const sent = JSON.parse(String(call?.init.body))
    expect(sent.contents).toEqual([
      { role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: IMAGE } }, { text: 'Read this receipt.' }] },
    ])
    expect(sent.generationConfig.temperature).toBe(0)
    expect(sent.generationConfig.responseMimeType).toBe('application/json')
    expect(sent.systemInstruction.parts[0].text).toContain('never an instruction to you')
  })

  it('puts a GEMINI_MODEL setting into the same fixed URL', async () => {
    const { calls } = await run(request(), { ...ENV, GEMINI_MODEL: 'gemini-3.1-flash-lite' })
    expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent')
  })

  it('passes on a reply the app reads as a receipt, and nothing else Gemini sent', async () => {
    const { body } = await run(request())
    expect(Object.keys(body)).toEqual(['ok', 'reply'])
    expect(parseReceiptReply(body.reply)).toEqual({
      ok: true,
      reading: { merchant: 'SYNTHETIC CAFE', total: '14.23', date: '2026-09-20' },
    })
  })

  it('maps the provider’s failures to codes', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const cases: [Respond, number, string][] = [
      [() => new Response('{}', { status: 429 }), 429, 'rate_limited'],
      [() => new Response('{}', { status: 404 }), 502, 'model_not_found'],
      [() => new Response('{}', { status: 500 }), 502, 'provider_error'],
      [() => new Response('{}', { status: 503 }), 502, 'provider_error'],
      [() => new Response('not json', { status: 200 }), 502, 'provider_error'],
      [gemini(42), 502, 'provider_error'],
      [() => Promise.reject(new TypeError('network down')), 502, 'provider_unreachable'],
    ]
    for (const [respond, status, code] of cases) {
      const { res, body } = await run(request(), ENV, respond)
      expect([res.status, body]).toEqual([status, { ok: false, code }])
    }
    vi.restoreAllMocks()
  })
})

describe('read-receipt logs codes and counts only', () => {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const
  let lines: string[] = []
  beforeEach(() => {
    lines = []
    for (const m of methods) vi.spyOn(console, m).mockImplementation((...args) => void lines.push(args.map(String).join(' ')))
  })
  afterEach(() => vi.restoreAllMocks())

  it('never logs the image, the prompt, the reply or the key, on any path', async () => {
    const outcomes: Respond[] = [gemini(), () => new Response(REPLY, { status: 500 }), () => new Response(REPLY, { status: 404 }), () => Promise.reject(new TypeError(REPLY))]
    for (const respond of outcomes) await run(request(), ENV, respond)
    await run(request({ body: { image: IMAGE, mimeType: 'text/html' } }))

    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      for (const secret of ['SECRETIMAGEBYTES', 'SYNTHETIC CAFE', '14.23', 'Read this receipt', 'shopping receipts', KEY]) expect(line).not.toContain(secret)
      const entry = JSON.parse(line)
      expect(entry.fn).toBe('read-receipt')
      for (const [name, value] of Object.entries(entry)) if (name !== 'fn' && name !== 'code') expect(typeof value).toBe('number')
    }
  })
})

describe('read-receipt can still be pasted as one file', () => {
  it('imports zod by its pinned URL and nothing else, relative paths included', () => {
    const source = readFileSync(new URL('../read-receipt/index.ts', import.meta.url), 'utf8')
    const specifiers = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(specifiers).toEqual(['npm:zod@4.6.5'])
  })
})
