import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LINK_REFUSED, SignIn, useSession } from '../src/auth.js'
import type { SupabaseClient } from '../src/supabase.js'
import { createFakeSupabase } from './fake-supabase.js'

/** App's own pairing of the two: the session decides, sign-in says why. */
function Gate({ supabase }: { supabase: SupabaseClient }) {
  const session = useSession(supabase)
  if (session.status !== 'signed-out') return null
  return <SignIn supabase={supabase} linkRefused={session.linkRefused} />
}

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('a sign-in link that does not sign in (SEC-NEW-2)', () => {
  it('says why, and takes the one-time code out of the address', async () => {
    window.history.replaceState(null, '', '/?code=invented-one-time-code#/month')
    render(<Gate supabase={createFakeSupabase().client} />)

    expect((await screen.findByRole('alert')).textContent).toBe(LINK_REFUSED)
    await waitFor(() => expect(window.location.search).toBe(''))
    expect(window.location.hash).toBe('#/month')
  })

  it('says nothing of links when the page was opened plainly', async () => {
    window.history.replaceState(null, '', '/#/month')
    render(<Gate supabase={createFakeSupabase().client} />)

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
