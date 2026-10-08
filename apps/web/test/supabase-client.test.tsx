import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSupabase } from '../src/supabase.js'

// In the DOM project for its localStorage, where the client keeps the
// verifier a code-flow link is exchanged with.
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('the Supabase client (SEC-5)', () => {
  it('asks for a sign-in link carrying a one-time code, not the tokens themselves', async () => {
    const sent: { url: string; body: string }[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input instanceof Request ? input.url : input), body: String(init?.body ?? '') })
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const client = createSupabase({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'x'.repeat(24) })

    await client.auth.signInWithOtp({ email: 'you@example.com', options: { shouldCreateUser: false } })

    const otp = sent.find((r) => r.url.includes('/auth/v1/otp'))
    const body = JSON.parse(otp?.body ?? '{}') as Record<string, unknown>
    // The link then holds a code only this browser, which kept the
    // verifier, can exchange: tokens never travel in the address bar.
    expect(body.code_challenge_method).toBe('s256')
    expect(typeof body.code_challenge).toBe('string')
  })
})

// Supabase's API can refuse a pass it issued a moment earlier: on
// 2026-10-08 it answered PGRST303 to one of four reads sent together right
// after a renewal, and the Week said "Could not load your data". Its own
// advice was to wait and try again (NOTICED N176).
describe('a pass the server refuses (PGRST303)', () => {
  const URL_ = 'https://example.supabase.co'
  const pass = (id: string) => ({
    access_token: `head.${btoa(JSON.stringify({ exp: 4102444800, sub: 'u1', id }))}.sig`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4102444800,
    refresh_token: `r-${id}`,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated' },
  })
  const store = (id: string) => window.localStorage.setItem('sb-example-auth-token', JSON.stringify(pass(id)))
  const refused = (code: string, status = 401) =>
    new Response(JSON.stringify({ code, message: 'refused', details: null, hint: null }), { status, headers: { 'content-type': 'application/json' } })
  const rows = () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })

  function serve(answers: readonly (() => Response)[]) {
    const reads: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (!url.includes('/rest/v1/')) return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      reads.push(new Headers(init?.headers).get('Authorization') ?? '')
      return (answers[reads.length - 1] ?? answers[answers.length - 1] ?? rows)()
    })
    return reads
  }

  it('reads again once, a moment later, and the screen gets its rows', async () => {
    store('a')
    const reads = serve([() => refused('PGRST303'), rows])
    const client = createSupabase({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: 'x'.repeat(24) }, { refusedPassWaitMs: 1 })

    const { data, error } = await client.from('categories').select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(reads).toHaveLength(2)
  })

  it('asks again with the pass the client holds by then', async () => {
    store('a')
    const reads = serve([
      () => {
        store('b') // renewed meanwhile, here or in another tab
        return refused('PGRST303')
      },
      rows,
    ])
    const client = createSupabase({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: 'x'.repeat(24) }, { refusedPassWaitMs: 1 })

    await client.from('categories').select('id')

    expect(reads[0]).toBe(`Bearer ${pass('a').access_token}`)
    expect(reads[1]).toBe(`Bearer ${pass('b').access_token}`)
  })

  it('tries once more only, so a pass refused twice still says so', async () => {
    store('a')
    const reads = serve([() => refused('PGRST303')])
    const client = createSupabase({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: 'x'.repeat(24) }, { refusedPassWaitMs: 1 })

    const { error } = await client.from('categories').select('id')

    expect(error?.code).toBe('PGRST303')
    expect(reads).toHaveLength(2)
  })

  it('never sends again what the database itself refused', async () => {
    store('a')
    const reads = serve([() => refused('42501', 403)])
    const client = createSupabase({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: 'x'.repeat(24) }, { refusedPassWaitMs: 1 })

    const { error } = await client.from('categories').select('id')

    expect(error?.code).toBe('42501')
    expect(reads).toHaveLength(1)
  })
})
