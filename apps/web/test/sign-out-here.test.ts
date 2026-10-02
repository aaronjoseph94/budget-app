import { afterEach, describe, expect, it } from 'vitest'
import { signOutHere } from '../src/sign-out.js'
import { SIGNED_OUT_HERE_ONLY, sessionKeyOf } from '../src/supabase.js'
import type { SupabaseClient } from '../src/supabase.js'

/** A browser's two stores, as the app's own client and recent questions use them. */
function stores() {
  const make = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size
      },
      keys: () => [...m.keys()],
    }
  }
  const local = make()
  const session = make()
  Object.assign(globalThis, { localStorage: local, sessionStorage: session })
  return { local, session }
}

const answering = (error: Error | null) => ({ auth: { signOut: () => Promise.resolve({ error }) } }) as unknown as SupabaseClient
const KEY = sessionKeyOf('https://abcdefghijklmnopqrst.supabase.co')

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
  Reflect.deleteProperty(globalThis, 'sessionStorage')
})

describe('signing out on this device (security-a-06)', () => {
  it("names the client's session key as Supabase's default does, so no one is signed out by naming it", () => {
    expect(KEY).toBe('sb-abcdefghijklmnopqrst-auth-token')
  })

  it('forgets the recent questions when the server signs out', async () => {
    const { local, session } = stores()
    local.setItem('budget.ask.recent', '["What did I spend at the bakery?"]')
    let reloaded = false
    await signOutHere(answering(null), { key: KEY, reload: () => (reloaded = true) })
    expect(local.keys()).toEqual([])
    expect(reloaded).toBe(false)
    expect(session.keys()).toEqual([])
  })

  it('still leaves no session here when the server cannot be reached with an expired token, and says so', async () => {
    const { local, session } = stores()
    local.setItem(KEY, '{"access_token":"expired","refresh_token":"still-live"}')
    // auth-js 2.117 keeps each flow's verifier in its own slot, with an index of them.
    local.setItem(`${KEY}-code-verifier`, 'verifier')
    local.setItem(`${KEY}-flow-abc-code-verifier`, 'reset-verifier')
    local.setItem(`${KEY}-flows-code-verifier`, '["abc"]')
    local.setItem('budget.ask.recent', '["How much is left?"]')
    // Another project's session, and a setting of this device's, are not this sign-out's.
    local.setItem('sb-otherprojectref-auth-token', '{}')
    local.setItem('budget.theme', 'dark')
    let reloaded = false
    await signOutHere(answering(new Error('Failed to fetch')), { key: KEY, reload: () => (reloaded = true) })
    expect(local.keys()).toEqual(['sb-otherprojectref-auth-token', 'budget.theme'])
    expect(reloaded).toBe(true)
    expect(session.getItem(SIGNED_OUT_HERE_ONLY)).toBe('1')
  })
})
