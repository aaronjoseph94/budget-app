import { describe, expect, it } from 'vitest'
import type { AiKeyStatus } from '@budget/schema'
import { aiStatus, askAi, statusOf, type AiView } from '../src/ai/client.js'
import { aiStatusReply, createFakeSupabase } from './fake-supabase.js'

const reply = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const saved = (status: AiKeyStatus = 'ok') => ({ source: 'saved' as const, hint: 'wxyz', status })

async function statusWith(set: (fake: ReturnType<typeof createFakeSupabase>) => void): Promise<AiView> {
  const fake = createFakeSupabase()
  set(fake)
  return aiStatus(fake.client)
}

async function stateWith(set: (fake: ReturnType<typeof createFakeSupabase>) => void): Promise<AiView> {
  const fake = createFakeSupabase()
  set(fake)
  const answer = await askAi(fake.client, { action: 'ping' })
  if (answer.ok) throw new Error('the helper answered')
  return answer.view
}

describe('every way the AI helper can answer becomes one state and one sentence', () => {
  it('says the helper is not installed when Supabase has no such function', async () => {
    const view = await stateWith((f) => void (f.functions.ai = null))
    expect([view.state, view.help]).toEqual(['not_deployed', 'updates'])
    expect(view.sentence).toBe('The AI helper isn’t installed yet. Everything else works. One-time updates shows how.')
  })

  it('says a one-time update is needed when 0016 is not in', async () => {
    const view = await stateWith((f) => void (f.functions.ai = reply({ ok: false, code: 'needs_update' }, 503)))
    expect([view.state, view.help]).toEqual(['needs_update', 'updates'])
  })

  it('says it could not reach the helper when the request never arrives', async () => {
    const view = await stateWith((f) => void (f.functions.ai = () => Promise.reject(new TypeError('Failed to fetch'))))
    expect([view.state, view.help, view.status]).toEqual(['unreachable', null, null])
  })

  it('reads Supabase’s own 401 as signed out, and an unknown answer as the helper’s trouble', async () => {
    expect((await stateWith((f) => void (f.functions.ai = reply({ msg: 'Invalid JWT' }, 401)))).state).toBe('not_signed_in')
    expect((await stateWith((f) => void (f.functions.ai = reply({ ok: false, code: 'wat' }, 500)))).state).toBe('helper_error')
    expect((await stateWith((f) => void (f.functions.ai = () => new Response('<html>', { status: 502 })))).state).toBe('helper_error')
    expect((await statusWith((f) => void (f.functions.ai = reply({ ok: true, services: 'none' })))).state).toBe('helper_error')
  })

  it('maps each of the helper’s own codes to its state', async () => {
    const fake = createFakeSupabase()
    const cases = [
      ['ai_off', 'off'], ['not_set_up', 'not_set_up'], ['limit_reached', 'limit_reached'], ['all_resting', 'all_resting'],
      ['all_failed', 'all_failed'], ['key_rejected', 'key_rejected'], ['keys_locked', 'keys_locked'], ['origin_not_allowed', 'helper_error'],
    ] as const
    for (const [code, state] of cases) {
      fake.functions.ai = reply({ ok: false, code }, 503)
      const answer = await askAi(fake.client, { action: 'ping' })
      expect(answer.ok ? null : answer.view.state).toBe(state)
    }
  })
})

describe('what AI settings says at the top', () => {
  it('says AI is not set up when no service has a key', async () => {
    const view = await statusWith(() => undefined)
    expect([view.state, view.help]).toEqual(['not_set_up', 'free-ai'])
    expect(view.status?.today).toEqual({ used: 0, cap: 40 })
  })

  it('names the receipts key when the Gemini secret is what works, and a saved Gemini key as free Google Gemini', async () => {
    const secret = await statusWith((f) => void (f.functions.aiStatus = aiStatusReply({
      services: aiStatusReply().services.map((s) => (s.provider === 'gemini' ? { ...s, source: 'secret' as const, hint: '0001' } : s)),
    })))
    expect([secret.state, secret.sentence]).toEqual(['on', 'AI is on, using your receipts key.'])
    const pasted = await statusWith((f) => void (f.functions.aiStatus = aiStatusReply({
      services: aiStatusReply().services.map((s) => (s.provider === 'gemini' ? { ...s, ...saved() } : s)),
    })))
    expect(pasted.sentence).toBe('AI is on, using free Google Gemini.')
  })

  it('counts a paid key only with paid services on', async () => {
    const services = aiStatusReply().services.map((s) => (s.provider === 'openai' ? { ...s, ...saved() } : s))
    expect((await statusWith((f) => void (f.functions.aiStatus = aiStatusReply({ services })))).state).toBe('not_set_up')
    const paid = await statusWith((f) => void (f.functions.aiStatus = aiStatusReply({ services, allowPaid: true })))
    expect(paid.sentence).toBe('AI is on, using OpenAI.')
  })

  it('says why a saved key cannot be used: locked after a key change, or turned down', async () => {
    const withKey = (status: AiKeyStatus) => aiStatusReply({
      services: aiStatusReply().services.map((s) => (s.provider === 'groq' ? { ...s, ...saved(status) } : s)),
    })
    expect((await statusWith((f) => void (f.functions.aiStatus = withKey('locked')))).state).toBe('keys_locked')
    expect((await statusWith((f) => void (f.functions.aiStatus = withKey('rejected')))).state).toBe('key_rejected')
    expect((await statusWith((f) => void (f.functions.aiStatus = withKey('busy')))).sentence).toBe('AI is on, using free Groq.')
  })

  it('says AI is off when the owner turned it off, and resting when today’s limit is used', async () => {
    expect((await statusWith((f) => void (f.functions.aiStatus = aiStatusReply({ enabled: false })))).state).toBe('off')
    const services = aiStatusReply().services.map((s) => (s.provider === 'gemini' ? { ...s, ...saved() } : s))
    const spent = await statusWith((f) => void (f.functions.aiStatus = aiStatusReply({ services, today: { used: 40, cap: 40 } })))
    expect([spent.state, spent.help]).toEqual(['limit_reached', 'ai-rests'])
  })

  it('asks the helper for status with nothing but the action', async () => {
    const fake = createFakeSupabase()
    await aiStatus(fake.client)
    expect(fake.functions.calls).toEqual([{ action: 'status' }])
  })
})

describe('a status reply is read only when it is one', () => {
  it('refuses a service it does not know, a model that is not text, or a missing count', () => {
    const good = aiStatusReply()
    expect(statusOf(good)).toEqual(good)
    expect(statusOf({ ...good, services: [{ ...good.services[0], provider: 'mistral' }] })).toBeNull()
    expect(statusOf({ ...good, services: [{ ...good.services[0], model: 7 }] })).toBeNull()
    expect(statusOf({ ...good, today: { used: 1 } })).toBeNull()
    expect(statusOf('ok')).toBeNull()
  })
})
