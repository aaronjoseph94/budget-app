import { describe, expect, it } from 'vitest'
import { askAi, type AiView } from '../src/ai/client.js'
import { createFakeSupabase } from './fake-supabase.js'

const reply = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

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
