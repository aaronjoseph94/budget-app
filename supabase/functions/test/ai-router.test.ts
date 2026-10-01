import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
/** A run's reply, either way, read field by field. The app reads none yet; its tasks arrive from A12. */
type Answer = { ok: boolean; code?: string; provider?: string; model?: string; text?: string; tried?: { provider: string; model: string; result: string }[] }
import { handle, listModels, route, sealKey } from '../ai/index.js'

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

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers })
const answers: Record<Service, () => Response> = {
  gemini: () => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] }),
  groq: () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }),
  openrouter: () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }),
  openai: () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}', refusal: null } }] }),
  anthropic: () => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }] }),
}
/** A service that sends its headers at once, then never finishes its body until its call is given up on. */
const stalls = (init: RequestInit) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"candidates":'))
        init.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')))
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
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
  /** ai_note_outcome answers this status, as a database that fails just then would. */
  noteStatus?: number
  /** ai_usage_claim and ai_note_outcome each answer only after this long, as a slow database would. */
  dbAfterMs?: number
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
  const waiting: { readonly seen: () => boolean; readonly resolve: () => void }[] = []
  /**
   * Resolves once `seen` holds, checked as each call is made. Opening a
   * saved key is WebCrypto, which fake timers do not drive, so a test
   * that moves the clock waits here for each call before moving it again.
   */
  const when = (seen: () => boolean) => new Promise<void>((resolve) => (seen() ? resolve() : waiting.push({ seen, resolve })))
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init: init ?? {} })
    for (const w of waiting.filter((w) => w.seen())) {
      waiting.splice(waiting.indexOf(w), 1)
      w.resolve()
    }
    if (u.endsWith('/auth/v1/user')) {
      if (w.authAfterMs !== undefined) await new Promise((r) => setTimeout(r, w.authAfterMs))
      return json({ id: USER })
    }
    if (u === `${PROJECT}/rest/v1/rpc/ai_context_for`) return json(context)
    const slow = u === `${PROJECT}/rest/v1/rpc/ai_usage_claim` || u === `${PROJECT}/rest/v1/rpc/ai_note_outcome`
    if (slow && w.dbAfterMs !== undefined) await new Promise((r) => setTimeout(r, w.dbAfterMs))
    if (u === `${PROJECT}/rest/v1/rpc/ai_usage_claim`) return json(claims.shift() ?? 'ok')
    if (u === `${PROJECT}/rest/v1/rpc/ai_note_outcome` && w.noteStatus !== undefined) return json({ code: '40001' }, w.noteStatus)
    if (u.startsWith(`${PROJECT}/rest/v1/rpc/`)) return new Response(null, { status: 204 })
    const service = serviceOf(u)
    if (service === undefined) return json({}, 404)
    return (w.services?.[service] ?? (() => json({}, 500)))(init ?? {})
  }) as typeof fetch
  return { calls, fetchFn, when }
}

async function run(w: World = {}, env: Record<string, string | undefined> = ENV) {
  const { calls, fetchFn, when } = await world(w, env)
  const req = new Request(`${PROJECT}/functions/v1/ai`, {
    method: 'POST',
    headers: { authorization: 'Bearer e30.e30.caller-token', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'run', task: 'test' }),
  })
  const pending = handle(req, env, fetchFn)
  return { pending, calls, when }
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

  it('marks a saved key rejected on a 401 and moves on', async () => {
    const r = await ran({ saved: ['groq', 'openrouter'], services: { gemini: () => json({}, 500), groq: () => json({}, 401), openrouter: answers.openrouter } })
    expect(r.body).toMatchObject({ ok: true, provider: 'openrouter' })
    expect(r.rpc('ai_key_mark')).toEqual([{ p_user: USER, p_provider: 'groq', p_status: 'rejected' }])
  })

  it('follows the owner’s order and chosen model, and passes over a key already turned down', async () => {
    const r = await ran({
      saved: ['groq', 'openrouter'], keyStatus: { groq: 'rejected' },
      settings: { provider_order: ['openrouter', 'gemini'], models: { gemini: 'gemini-3.1-flash-lite' } },
      services: { openrouter: () => json({}, 500) },
    })
    expect(r.services).toEqual(['openrouter', 'gemini'])
    expect(r.calls.some((c) => c.url.endsWith('/gemini-3.1-flash-lite:generateContent'))).toBe(true)
    expect(r.body).toMatchObject({ ok: false, code: 'all_failed' })
  })

  it('gives up on a service that never answers, with an abort, and asks the next', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const { pending, calls, when } = await run({ saved: ['groq'], services: { gemini: silent, groq: answers.groq } })
    await when(() => calls.some((c) => serviceOf(c.url) === 'gemini'))
    await vi.advanceTimersByTimeAsync(20_000)
    const res = await pending
    const r = summary(res.status, await res.text(), calls)
    expect(r.body).toMatchObject({ ok: true, provider: 'groq' })
    expect(r.rpc('ai_note_outcome')[0]).toMatchObject({ p_provider: 'gemini', p_code: 'timeout', p_cooldown_until: null })
  })

  it('gives up on a service whose reply stalls after its headers, and asks the next (backend-b-05)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const { pending, calls, when } = await run({ saved: ['groq'], services: { gemini: stalls, groq: answers.groq } })
    await when(() => calls.some((c) => serviceOf(c.url) === 'gemini'))
    await vi.advanceTimersByTimeAsync(20_000)
    const res = await pending
    const r = summary(res.status, await res.text(), calls)
    expect(r.body).toMatchObject({ ok: true, provider: 'groq' })
    expect(r.rpc('ai_note_outcome')[0]).toMatchObject({ p_provider: 'gemini', p_code: 'timeout', p_cooldown_until: null })
  })

  it('gives up on a key test whose list stalls after its headers (backend-b-05)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const pending = listModels('groq', 'test-not-a-real-groq-key', (async (_url: string | URL | Request, init?: RequestInit) => stalls(init ?? {})) as typeof fetch)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await pending).toEqual({ outcome: 'timeout', listed: [] })
  })

  it('starts no attempt whose whole timeout would pass the deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    // 15 s already spent on the request; two silent services take 20 s each, leaving 45 s: too little
    // for a third attempt's 20 s plus up to 10 s each for its claim, its note and a key mark.
    const { calls, fetchFn, when } = await world({ saved: ['groq', 'openrouter'], services: { gemini: silent, groq: silent, openrouter: answers.openrouter } })
    const ask = { system: 'Answer.', data: {}, schema: { type: 'object' }, maxOutputTokens: 64 }
    const pending = route(ENV, USER, 'test', ask, Date.now() - 15_000, fetchFn)
    const asked = (service: Service) => () => calls.some((c) => serviceOf(c.url) === service)
    await when(asked('gemini'))
    await vi.advanceTimersByTimeAsync(20_000)
    await when(asked('groq'))
    await vi.advanceTimersByTimeAsync(20_000)
    const [status, body] = (await pending) as [number, Answer]
    const r = { status, body, services: calls.map((c) => serviceOf(c.url)).filter((s) => s !== undefined) }
    expect(r.services).toEqual(['gemini', 'groq'])
    expect([r.status, r.body.code, r.body.tried]).toEqual([502, 'all_failed', [
      { provider: 'gemini', model: 'gemini-3.5-flash-lite', result: 'timeout' },
      { provider: 'groq', model: 'openai/gpt-oss-20b', result: 'timeout' },
    ]])
  })

  it('counts the database calls around an attempt, so the reply comes inside the deadline (review-r-01)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    // Every claim and every note takes 9.9 s, just inside the database's 10 s; each service is
    // silent for its 20 s. Two attempts end at 79.6 s. A third would be claimed until 89.5 s,
    // asked until 109.5 s and noted until 119.4 s: past the app's 110 s wait, so it must not start.
    const { calls, fetchFn, when } = await world({
      saved: ['groq', 'openrouter'], dbAfterMs: 9_900,
      settings: { provider_order: ['groq', 'openrouter', 'gemini'] },
      services: { groq: silent, openrouter: silent, gemini: silent },
    })
    const ask = { system: 'Answer.', data: {}, schema: { type: 'object' }, maxOutputTokens: 64 }
    const started = Date.now()
    let answeredAt = Number.NaN
    const pending = route(ENV, USER, 'test', ask, started, fetchFn).then((reply) => {
      answeredAt = Date.now()
      return reply
    })
    const made = (fn: string, n: number) => () => calls.filter((c) => c.url === `${PROJECT}/rest/v1/rpc/${fn}`).length === n
    const asked = (service: Service) => () => calls.some((c) => serviceOf(c.url) === service)
    await when(made('ai_usage_claim', 1))
    await vi.advanceTimersByTimeAsync(9_900)
    await when(asked('groq'))
    await vi.advanceTimersByTimeAsync(20_000)
    await when(made('ai_note_outcome', 1))
    await vi.advanceTimersByTimeAsync(9_900)
    await when(made('ai_usage_claim', 2))
    await vi.advanceTimersByTimeAsync(9_900)
    await when(asked('openrouter'))
    await vi.advanceTimersByTimeAsync(20_000)
    await when(made('ai_note_outcome', 2))
    // Gemini's key needs no opening, so a third attempt would run on fake time alone.
    await vi.advanceTimersByTimeAsync(60_000)
    const [status, body] = (await pending) as [number, Answer]
    const services = calls.map((c) => serviceOf(c.url)).filter((s) => s !== undefined)
    expect(services).toEqual(['groq', 'openrouter'])
    expect([status, body.code]).toEqual([502, 'all_failed'])
    expect(answeredAt - started).toBe(79_600)
  })

  it('keeps a good reply when only noting its outcome failed (backend-b-07)', async () => {
    const r = await ran({ noteStatus: 500, services: { gemini: answers.gemini } })
    expect([r.status, r.body]).toEqual([200, { ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: '{"ok":true}' }])
    expect(r.services).toEqual(['gemini'])
  })

  it('still stops when noting a failed attempt fails, rather than trying on blind', async () => {
    const r = await ran({ saved: ['groq'], noteStatus: 500, services: { gemini: () => json({}, 503), groq: answers.groq } })
    expect([r.status, r.body.code]).toEqual([503, 'helper_error'])
    expect(r.services).toEqual(['gemini'])
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

  it('passes over a free service whose own limit is spent', async () => {
    const r = await ran({ saved: ['groq'], claims: ['service_cap'], services: { groq: answers.groq } })
    expect(r.body).toMatchObject({ ok: true, provider: 'groq' })
    expect(r.services).toEqual(['groq'])
  })

  it('rests Gemini until midnight Pacific when its free daily quota is spent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-09-25T17:00:00Z'))
    const perDay = { error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }
    const r = await ran({ services: { gemini: () => json(perDay, 429) } })
    expect(r.rpc('ai_note_outcome')[0]).toMatchObject({ p_code: 'rate_limited', p_cooldown_until: '2026-09-26T07:00:00.000Z' })
    expect(r.body.code).toBe('all_failed')
  })

  it('skips a resting service without a call, and says all are resting when none is left', async () => {
    const r = await ran({ saved: ['groq'], resting: [{ provider: 'gemini', model: 'gemini-3.5-flash-lite' }, { provider: 'groq', model: 'openai/gpt-oss-20b' }] })
    expect([r.status, r.body.code, r.services, r.rpc('ai_usage_claim')]).toEqual([503, 'all_resting', [], []])
    expect(r.body.tried?.map((t) => t.result)).toEqual(['resting', 'resting'])
  })

  it('passes over Groq when a request would go past its budget, without a claim', async () => {
    // Groq would answer if it were asked, so only its budget can pass it over.
    const { calls, fetchFn } = await world({ saved: ['groq'], settings: { provider_order: ['groq', 'gemini'] }, services: { groq: answers.groq, gemini: answers.gemini } })
    const big = { system: 'SYSTEM', data: { text: 'x'.repeat(16_000) }, schema: { type: 'object' }, maxOutputTokens: 400 }
    const [status, body] = await route(ENV, USER, 'test', big, Date.now(), fetchFn)
    expect([status, body]).toMatchObject([200, { ok: true, provider: 'gemini' }])
    const r = summary(status, JSON.stringify(body), calls)
    expect(r.services).toEqual(['gemini'])
    expect(r.rpc('ai_usage_claim').map((c) => c['p_provider'])).toEqual(['gemini'])
  })
})

describe('when AI cannot run', () => {
  it('says ai_off when the owner switched AI off, and asks nothing', async () => {
    const r = await ran({ settings: { enabled: false } })
    expect([r.status, r.body.code, r.services]).toEqual([409, 'ai_off', []])
  })

  it('says a key must be pasted again when the only key was turned down or cannot be opened', async () => {
    const env = { ...ENV, GEMINI_API_KEY: undefined }
    expect((await ran({ saved: ['groq'], keyStatus: { groq: 'rejected' } }, env)).body.code).toBe('key_rejected')
    const other = { ...env, SUPABASE_SERVICE_ROLE_KEY: ['header', 'payload', 'changed'].join('.') }
    const { calls, fetchFn } = await world({ saved: ['groq'] }, env)
    const [, body] = await route(other, USER, 'test', { system: 's', data: {}, schema: {}, maxOutputTokens: 10 }, Date.now(), fetchFn)
    expect(body).toMatchObject({ code: 'keys_locked' })
    expect(calls.filter((c) => c.url.endsWith('ai_key_mark')).map((c) => JSON.parse(String(c.init.body)) as unknown)).toEqual([
      { p_user: USER, p_provider: 'groq', p_status: 'locked' },
    ])
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
