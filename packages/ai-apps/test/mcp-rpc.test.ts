import { afterEach, describe, expect, it, vi } from 'vitest'
import { SENTENCES, answer, refusal, rpc, type Caller } from '../src/rpc.js'
import { ENV, PROJECT, fakeFetch, type Respond } from './fake-auth.js'

/**
 * The RPC layer (PLAN §2.5, §2.8): one POST with the caller's own token,
 * the gate's refusals as sentences, and nothing of a database error's body
 * logged or passed on.
 */
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const project = { url: PROJECT, anonKey: ENV.SUPABASE_ANON_KEY }

function caller(respond: Respond): { caller: Caller; calls: ReturnType<typeof fakeFetch>['calls'] } {
  const fake = fakeFetch(respond)
  return { caller: { token: 'the-token', project, fetchFn: fake.fetchFn }, calls: fake.calls }
}

afterEach(() => vi.restoreAllMocks())

describe('rpc', () => {
  it('posts the arguments with the caller’s own token and the anon key, following no redirect', async () => {
    const { caller: who, calls } = caller(() => reply({ today: '2026-09-29' }))
    expect(await rpc(who, 'ai_app_read', { p_parts: ['categories'] })).toEqual({ today: '2026-09-29' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${PROJECT}/rest/v1/rpc/ai_app_read`)
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      body: '{"p_parts":["categories"]}',
      headers: { apikey: ENV.SUPABASE_ANON_KEY, Authorization: 'Bearer the-token', 'Content-Type': 'application/json' },
    })
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    ['a refusal from the gate', () => reply({ refused: 'limit_reached' }), 'limit_reached'],
    // 0030: the token's sign-in has ended (Disconnect), though the token has not expired.
    ['a disconnected sign-in', () => reply({ refused: 'disconnected' }), 'disconnected'],
    ['a code the server does not know', () => reply({ refused: 'SECRET-code' }), 'server_error'],
    ['the function missing (0020 not pasted)', () => reply({ code: 'PGRST202', message: 'SECRET-body' }, 404), 'needs_update'],
    ['any other failure', () => reply({ code: 'XX000', message: 'SECRET-body' }, 500), 'server_error'],
    ['a reply that is not an object', () => reply(['SECRET-list']), 'server_error'],
    ['a reply that is not JSON', () => new Response('SECRET-text'), 'server_error'],
    ['a redirect', () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }), 'server_error'],
    ['the database out of reach', () => { throw new TypeError('SECRET-network') }, 'server_error'],
  ])('reads %s as a refusal, and logs none of it', async (_, respond, code) => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(await rpc(caller(respond as Respond).caller, 'ai_app_review', { p_limit: 1 })).toEqual({ refused: code })
    expect(JSON.stringify(logged.mock.calls)).not.toContain('SECRET')
  })
})

describe('what a tool answers', () => {
  it('gives a result as structured content and the same JSON as text', () => {
    expect(answer({ as_of: '2026-09-29', n: 1 })).toEqual({
      content: [{ type: 'text', text: '{"as_of":"2026-09-29","n":1}' }],
      structuredContent: { as_of: '2026-09-29', n: 1 },
    })
  })

  it('gives a refusal as its one sentence', () => {
    expect(refusal('ai_apps_off')).toEqual({ isError: true, content: [{ type: 'text', text: SENTENCES.ai_apps_off }] })
    expect(SENTENCES.needs_update).toBe('The budget app needs a one-time update. The owner can open Help → One-time updates.')
  })
})
