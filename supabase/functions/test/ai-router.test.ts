import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
/** A run's reply, either way, read field by field. The app reads none yet; its tasks arrive from A12. */
type Answer = { ok: boolean; code?: string; provider?: string; model?: string; text?: string; tried?: { provider: string; model: string; result: string }[] }
import { handle, route, sealKey } from '../ai/index.js'

/**
 * `run` and its router (plan §3.5, ADR 0004): the owner's order, paid
 * services only when switched on, rested services skipped, a claim before
 * every attempt, budgets, timeouts inside the deadline, and rests noted.
 * Every fetch is a fake: the auth server, 0016's functions and the five
 * services. The keys are obviously not real ones.
 */

const PROJECT = 'https://project.supabase.co'
const USER = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455'
const LEGACY = ['header', 'payload', 'signature'].join('.')
const SECRET = 'test-not-a-real-secret-0002'
const ENV = { SUPABASE_URL: PROJECT, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: LEGACY, GEMINI_API_KEY: SECRET }

const CHAT = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
} as const
type Service = keyof typeof CHAT
const ALLOWED = new Set<string>([`${PROJECT}/auth/v1/user`, ...Object.values(CHAT)])
// Gemini's address names the model; the others name it in the body.
const serviceOf = (url: string): Service | undefined =>
  url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/') ? 'gemini' : (Object.keys(CHAT) as Service[]).find((s) => CHAT[s] === url)

/**
 * Real turns of the event loop until `seen` holds. Opening a saved key is
 * WebCrypto, which fake timers do not drive, so a test that moves the
 * clock waits for each call to be made before it moves the clock again.
 */
async function until(seen: () => boolean) {
  for (let i = 0; i < 1000 && !seen(); i++) await new Promise((r) => setImmediate(r))
  expect(seen()).toBe(true)
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers })
const answers: Record<Service, () => Response> = {
  gemini: () => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] }),
  groq: () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }),
  openrouter: () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }),
  openai: () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}', refusal: null } }] }),
  anthropic: () => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }] }),
}
/** A service that never answers until its call is given up on. */
const silent = (init: RequestInit) =>
  new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))

interface World {
  settings?: Record<string, unknown>
  saved?: readonly Service[]
  keyStatus?: Partial<Record<Service, string>>
  resting?: readonly { provider: Service; model: string }[]
  services?: Partial<Record<Service, (init: RequestInit) => Response | Promise<Response>>>
  claims?: string[]
  authAfterMs?: number
}

const SETTINGS = { enabled: true, provider_order: ['gemini', 'groq', 'openrouter', 'openai', 'anthropic'], models: {}, daily_cap: 40, allow_paid: false }

async function world(w: World = {}, env: Record<string, string | undefined> = ENV) {
  const keys = await Promise.all(
    (w.saved ?? []).map(async (provider) => ({
      provider, ...(await sealKey(env, USER, provider, `test-not-a-real-${provider}-key`)), key_hint: 'key', status: w.keyStatus?.[provider] ?? 'ok',
    })),
  )
  const context = { settings: { ...SETTINGS, ...w.settings }, keys, usage: [], resting: (w.resting ?? []).map((r) => ({ ...r, until: 'later', code: 'rate_limited' })) }
  const claims = [...(w.claims ?? [])]
  const calls: { url: string; init: RequestInit }[] = []
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init: init ?? {} })
    if (u.endsWith('/auth/v1/user')) {
      if (w.authAfterMs !== undefined) await new Promise((r) => setTimeout(r, w.authAfterMs))
      return json({ id: USER })
    }
    if (u === `${PROJECT}/rest/v1/rpc/ai_context_for`) return json(context)
    if (u === `${PROJECT}/rest/v1/rpc/ai_usage_claim`) return json(claims.shift() ?? 'ok')
    if (u.startsWith(`${PROJECT}/rest/v1/rpc/`)) return new Response(null, { status: 204 })
    const service = serviceOf(u)
    if (service === undefined) return json({}, 404)
    return (w.services?.[service] ?? (() => json({}, 500)))(init ?? {})
  }) as typeof fetch
  return { calls, fetchFn }
}

async function run(w: World = {}, env: Record<string, string | undefined> = ENV) {
  const { calls, fetchFn } = await world(w, env)
  const req = new Request(`${PROJECT}/functions/v1/ai`, {
    method: 'POST',
    headers: { authorization: 'Bearer caller-token', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'run', task: 'test' }),
  })
  const pending = handle(req, env, fetchFn)
  return { pending, calls }
}
async function ran(w: World = {}, env: Record<string, string | undefined> = ENV) {
  const { pending, calls } = await run(w, env)
  const res = await pending
  const text = await res.text()
  return summary(res.status, text, calls)
}
function summary(status: number, text: string, calls: { url: string; init: RequestInit }[]) {
  const rpc = (fn: string) => calls.filter((c) => c.url === `${PROJECT}/rest/v1/rpc/${fn}`).map((c) => JSON.parse(String(c.init.body)) as Record<string, unknown>)
  const services = calls.map((c) => serviceOf(c.url)).filter((s) => s !== undefined)
  return { status, text, body: JSON.parse(text) as Answer, calls, rpc, services }
}

let lines: string[] = []
beforeEach(() => {
  lines = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' ')))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('failing over, in the owner’s order', () => {
  it('rests a busy service for its Retry-After and answers from the next one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-09-25T17:00:00Z'))
    const r = await ran({ saved: ['groq'], services: { gemini: () => json({}, 429, { 'retry-after': '120' }), groq: answers.groq } })
    expect([r.status, r.body]).toEqual([200, { ok: true, provider: 'groq', model: 'openai/gpt-oss-20b', text: '{"ok":true}' }])
    expect(r.services).toEqual(['gemini', 'groq'])
    expect(r.rpc('ai_note_outcome')).toEqual([
      { p_user: USER, p_provider: 'gemini', p_model: 'gemini-3.5-flash-lite', p_task: 'test', p_code: 'rate_limited', p_cooldown_until: '2026-09-25T17:02:00.000Z' },
      { p_user: USER, p_provider: 'groq', p_model: 'openai/gpt-oss-20b', p_task: 'test', p_code: 'ok', p_cooldown_until: null },
    ])
  })

  it('claims every attempt before it is made, with its estimated tokens and its limits', async () => {
    const r = await ran({ saved: ['groq'], services: { gemini: () => json({}, 503), groq: answers.groq } })
    const order = r.calls.map((c) => c.url.replace(`${PROJECT}/rest/v1/rpc/`, '')).filter((u) => !u.includes('auth'))
    expect(order).toEqual(['ai_context_for', 'ai_usage_claim', CHAT.gemini, 'ai_note_outcome', 'ai_usage_claim', CHAT.groq, 'ai_note_outcome'])
    const [gemini, groq] = r.rpc('ai_usage_claim')
    expect(gemini).toMatchObject({ p_user: USER, p_provider: 'gemini', p_task: 'test', p_task_limit: 10, p_service_limit: 200, p_service_tokens: null })
    expect(groq).toMatchObject({ p_provider: 'groq', p_model: 'openai/gpt-oss-20b', p_service_limit: 300, p_service_tokens: 150000 })
    const sent = r.calls.find((c) => c.url === CHAT.groq)
    expect(groq?.['p_tokens']).toBe(Math.ceil(new TextEncoder().encode(String(sent?.init.body)).length / 3))
  })

  it('gives up on a service that never answers, with an abort, and asks the next', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const { pending, calls } = await run({ saved: ['groq'], services: { gemini: silent, groq: answers.groq } })
    await until(() => calls.some((c) => serviceOf(c.url) === 'gemini'))
    await vi.advanceTimersByTimeAsync(20_000)
    const res = await pending
    const r = summary(res.status, await res.text(), calls)
    expect(r.body).toMatchObject({ ok: true, provider: 'groq' })
    expect(r.rpc('ai_note_outcome')[0]).toMatchObject({ p_provider: 'gemini', p_code: 'timeout', p_cooldown_until: null })
  })

  it('starts no attempt whose whole timeout would pass the deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    // Signing in took 45 s; two silent services take 20 s each, leaving 15 s: too little for a third.
    const { pending, calls } = await run({ saved: ['groq', 'openrouter'], authAfterMs: 45_000, services: { gemini: silent, groq: silent, openrouter: answers.openrouter } })
    const asked = (service: Service) => () => calls.some((c) => serviceOf(c.url) === service)
    await until(() => calls.length > 0)
    await vi.advanceTimersByTimeAsync(45_000)
    await until(asked('gemini'))
    await vi.advanceTimersByTimeAsync(20_000)
    await until(asked('groq'))
    await vi.advanceTimersByTimeAsync(20_000)
    const res = await pending
    const r = summary(res.status, await res.text(), calls)
    expect(r.services).toEqual(['gemini', 'groq'])
    expect([r.status, r.body.code, r.body.tried]).toEqual([502, 'all_failed', [
      { provider: 'gemini', model: 'gemini-3.5-flash-lite', result: 'timeout' },
      { provider: 'groq', model: 'openai/gpt-oss-20b', result: 'timeout' },
    ]])
  })

  it('makes at most three attempts', async () => {
    const r = await ran({ saved: ['groq', 'openrouter', 'openai'], settings: { allow_paid: true } })
    expect(r.services).toEqual(['gemini', 'groq', 'openrouter'])
    expect(r.rpc('ai_usage_claim')).toHaveLength(3)
  })
})

describe('paid services', () => {
  it('are never asked while Use paid services is off', async () => {
    const r = await ran({ saved: ['openai', 'anthropic'], services: { gemini: () => json({}, 500), openai: answers.openai } })
    expect(r.services).toEqual(['gemini'])
    expect(r.body.code).toBe('all_failed')
  })

  it('are asked, in order, once it is on', async () => {
    const r = await ran({ saved: ['openai'], settings: { allow_paid: true }, services: { gemini: () => json({}, 500), openai: answers.openai } })
    expect(r.body).toMatchObject({ ok: true, provider: 'openai', model: 'gpt-5-nano' })
  })

  it('with only a paid key and the switch off, AI is not set up', async () => {
    const r = await ran({ saved: ['anthropic'] }, { ...ENV, GEMINI_API_KEY: undefined })
    expect([r.status, r.body.code, r.services]).toEqual([409, 'not_set_up', []])
  })
})

describe('limits and rests', () => {
  it('calls no service once the day’s limit or the task’s is reached', async () => {
    for (const cap of ['daily_cap', 'task_cap']) {
      const r = await ran({ claims: [cap], services: { gemini: answers.gemini } })
      expect([cap, r.status, r.body.code, r.services]).toEqual([cap, 429, 'limit_reached', []])
    }
  })

  it('rests Gemini until midnight Pacific when its free daily quota is spent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-09-25T17:00:00Z'))
    const perDay = { error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }
    const r = await ran({ services: { gemini: () => json(perDay, 429) } })
    expect(r.rpc('ai_note_outcome')[0]).toMatchObject({ p_code: 'rate_limited', p_cooldown_until: '2026-09-26T07:00:00.000Z' })
    expect(r.body.code).toBe('all_failed')
  })
})

describe('when AI cannot run', () => {
  it('says ai_off when the owner switched AI off, and asks nothing', async () => {
    const r = await ran({ settings: { enabled: false } })
    expect([r.status, r.body.code, r.services]).toEqual([409, 'ai_off', []])
  })

  it('says needs_update when 0016’s claim is not there yet', async () => {
    const { fetchFn } = await world()
    const missing = (async (url: string | URL | Request, init?: RequestInit) =>
      String(url).endsWith('ai_usage_claim') ? json({ code: 'PGRST202' }, 404) : fetchFn(url, init)) as typeof fetch
    const [status, body] = await route(ENV, USER, 'test', { system: 's', data: {}, schema: {}, maxOutputTokens: 10 }, Date.now(), missing)
    expect([status, body]).toEqual([503, { ok: false, code: 'needs_update', tried: [] }])
  })
})

describe('what leaves the helper', () => {
  it('reaches no address but the fixed ones, and logs no key, prompt or reply', async () => {
    const all = await Promise.all([
      ran({ saved: ['groq', 'openrouter', 'openai', 'anthropic'], settings: { allow_paid: true, provider_order: ['openai', 'anthropic', 'gemini'] } }),
      ran({ saved: ['groq', 'openrouter'], services: { openrouter: answers.openrouter } }),
    ])
    for (const r of all) {
      for (const c of r.calls) expect([c.url, ALLOWED.has(c.url) || c.url.startsWith(`${PROJECT}/rest/v1/rpc/`)]).toEqual([c.url, true])
      expect(r.text).not.toMatch(/not-a-real|connection works/)
    }
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line).not.toMatch(/not-a-real|ok":true|connection/)
      expect(Object.keys(JSON.parse(line) as object).every((k) => ['fn', 'code', 'attempts', 'tried'].includes(k))).toBe(true)
    }
  })
})
