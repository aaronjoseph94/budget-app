import { describe, expect, it } from 'vitest'
import type { AiStatusReply } from '@budget/schema'
import { handle } from '../ai/index.js'

/**
 * `status`: what is set up, read from 0016's ai_context_for, and never a
 * key. The fake answers the auth server and the database; nothing here
 * reaches Supabase.
 */

const PROJECT = 'https://project.supabase.co'
const USER = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455'
const LEGACY = ['header', 'payload', 'signature'].join('.') // a legacy key's three-part shape, and nothing a scanner could take for one
const ENV = { SUPABASE_URL: PROJECT, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: LEGACY }
const CIPHER = 'CIPHERTEXTCIPHERTEXTCIPHERTEXTCIPHERTEXTCIPHERTEXT'

const SETTINGS = {
  enabled: true, provider_order: ['gemini', 'groq', 'openrouter', 'openai', 'anthropic'], models: {},
  daily_cap: 40, allow_paid: false, tone: 'cheerleader', share_shop_names: true,
}
const context = (over: Record<string, unknown> = {}) => ({ day: '2026-09-24', settings: SETTINGS, keys: [], usage: [], resting: [], ...over })

type Call = { url: string; init: RequestInit }
async function status(env: Record<string, string | undefined>, db: () => Response) {
  const calls: Call[] = []
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return String(url).endsWith('/auth/v1/user') ? new Response(JSON.stringify({ id: USER })) : db()
  }) as typeof fetch
  const req = new Request(`${PROJECT}/functions/v1/ai`, {
    method: 'POST',
    headers: { authorization: 'Bearer caller-token', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'status' }),
  })
  const res = await handle(req, env, fetchFn)
  const text = await res.text()
  return { res, text, body: JSON.parse(text) as AiStatusReply & { code?: string }, calls }
}
const answer = (body: unknown, code = 200) => () => new Response(JSON.stringify(body), { status: code })
const service = (reply: AiStatusReply, provider: string) => reply.services.find((s) => s.provider === provider)

describe('status says what is set up', () => {
  it('shows the Gemini secret as the secret, with its last four characters and the default model', async () => {
    const { res, body } = await status({ ...ENV, GEMINI_API_KEY: 'test-not-a-real-key-0001' }, answer(context()))
    expect(res.status).toBe(200)
    expect(service(body, 'gemini')).toEqual({
      provider: 'gemini', tier: 'free', source: 'secret', hint: '0001', status: null, model: 'gemini-3.5-flash-lite',
    })
    expect(body.services.map((s) => [s.provider, s.tier, s.source])).toEqual([
      ['gemini', 'free', 'secret'], ['groq', 'free', 'none'], ['openrouter', 'free', 'none'], ['openai', 'paid', 'none'], ['anthropic', 'paid', 'none'],
    ])
    expect([body.enabled, body.allowPaid, body.today]).toEqual([true, false, { used: 0, cap: 40 }])
  })

  it('prefers a saved key to the secret, and never sends its ciphertext, IV or root', async () => {
    const saved = { provider: 'gemini', ciphertext: CIPHER, iv: 'IVIVIVIVIVIVIVIV', kek_id: 'feedfacefeedface', key_v: 1, key_hint: 'wxyz', status: 'busy', model: null }
    const { body, text } = await status(
      { ...ENV, GEMINI_API_KEY: 'test-not-a-real-key-0001' },
      answer(context({ keys: [saved, { ...saved, provider: 'openai', key_hint: 'lmno', status: 'ok' }, { ...saved, provider: 'groq', key_hint: '<b>', status: 'fine' }] })),
    )
    expect(service(body, 'gemini')).toMatchObject({ source: 'saved', hint: 'wxyz', status: 'busy' })
    expect(service(body, 'openai')).toMatchObject({ source: 'saved', hint: 'lmno', status: 'ok', model: 'gpt-5-nano' })
    // A row the helper did not write is shown as no hint and no status, never as it came.
    expect(service(body, 'groq')).toMatchObject({ source: 'saved', hint: null, status: null })
    expect(text).not.toMatch(/CIPHERTEXT|IVIVIV|feedface|ciphertext|kek_id|test-not-a-real-key/)
  })

  it('uses a chosen model only when it is on the list, and counts today’s calls against the limit', async () => {
    const settings = { ...SETTINGS, models: { groq: 'openai/gpt-oss-120b', openai: 'https://evil.example/v1' }, daily_cap: 12, allow_paid: true, enabled: false }
    const usage = [{ attempts: 3 }, { attempts: 4 }]
    const { body } = await status({ ...ENV, GEMINI_MODEL: 'gemini-3.5-flash' }, answer(context({ settings, usage })))
    expect(body.services.map((s) => s.model)).toEqual(['gemini-3.5-flash', 'openai/gpt-oss-120b', 'openrouter/free', 'gpt-5-nano', 'claude-haiku-4-5'])
    expect([body.enabled, body.allowPaid, body.today]).toEqual([false, true, { used: 7, cap: 12 }])
  })
})

describe('status when the database cannot say', () => {
  it('says needs_update when 0016’s function is not there yet', async () => {
    for (const code of ['PGRST202', '42883']) {
      const { res, body } = await status(ENV, answer({ code, message: 'x' }, 404))
      expect([res.status, body]).toEqual([503, { ok: false, code: 'needs_update' }])
    }
  })

  it('says helper_error for any other refusal, a dropped connection, an odd answer or no database key', async () => {
    const odd = await status(ENV, answer({ settings: {} }))
    const refused = await status(ENV, answer({ code: '42501', message: 'x' }, 403))
    const dropped = await status(ENV, () => {
      throw new Error('offline')
    })
    const keyless = await status({ SUPABASE_URL: PROJECT, SUPABASE_ANON_KEY: 'anon' }, answer(context()))
    for (const r of [odd, refused, dropped, keyless]) expect([r.res.status, r.body.code]).toEqual([503, 'helper_error'])
    expect(keyless.calls.map((c) => c.url)).toEqual([`${PROJECT}/auth/v1/user`])
  })
})
