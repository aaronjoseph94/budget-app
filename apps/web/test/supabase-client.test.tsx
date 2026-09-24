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
