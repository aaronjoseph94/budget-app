import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_LINK_REFUSED, LINK_REFUSED, NewPassword, SIGNED_OUT_HERE_ONLY_NOTE, SignIn, returnAddress, useSession } from '../src/auth.js'
import type { SupabaseClient } from '../src/supabase.js'
import { createFakeSupabase } from './fake-supabase.js'
import { expectNoAxeViolations } from './axe.js'

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
    await expectNoAxeViolations()
  })

  it('takes tokens a dashboard link put after # out of the address, and says such links do not work here', async () => {
    window.history.replaceState(null, '', '/#access_token=invented-access&refresh_token=invented-refresh&type=recovery')
    render(<Gate supabase={createFakeSupabase().client} />)

    expect((await screen.findByRole('alert')).textContent).toBe(DASHBOARD_LINK_REFUSED)
    expect(window.location.href).not.toMatch(/invented|access_token|refresh_token/)
  })

  it('takes the error of an expired link out of the address too', async () => {
    window.history.replaceState(null, '', '/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid#/month')
    render(<Gate supabase={createFakeSupabase().client} />)

    expect((await screen.findByRole('alert')).textContent).toBe(LINK_REFUSED)
    await waitFor(() => expect(window.location.search).toBe(''))
    expect(window.location.hash).toBe('#/month')
  })

  it("reads an expired link's error after # as the owner's own link, not a dashboard one, and takes it out", async () => {
    window.history.replaceState(null, '', '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    render(<Gate supabase={createFakeSupabase().client} />)

    expect((await screen.findByRole('alert')).textContent).toBe(LINK_REFUSED)
    expect(window.location.href).not.toMatch(/error/)
  })

  it('balances the subtitle over its lines, so no word is left alone on the last (V23)', async () => {
    window.history.replaceState(null, '', '/#/month')
    render(<Gate supabase={createFakeSupabase().client} />)
    expect((await screen.findByText('Your money, visible only to you.')).className).toContain('text-balance')
  })

  it('says nothing of links when the page was opened plainly', async () => {
    window.history.replaceState(null, '', '/#/month')
    render(<Gate supabase={createFakeSupabase().client} />)

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/** Only the calls SignIn makes; Supabase's answer to a link request is given. */
function linkAnswering(error: { code?: string; message: string } | null): SupabaseClient {
  const auth = {
    signInWithPassword: () => Promise.resolve({ error: null }),
    signInWithOtp: () => Promise.resolve({ error }),
  }
  return { auth } as unknown as SupabaseClient
}

async function askForLink(supabase: SupabaseClient): Promise<void> {
  render(<SignIn supabase={supabase} />)
  fireEvent.click(screen.getByRole('button', { name: 'Email me a link instead' }))
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'stranger@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }))
}

describe('an emailed link for an address with no account', () => {
  it('reads as a sent link, so the form cannot tell who is registered', async () => {
    await askForLink(linkAnswering({ code: 'otp_disabled', message: 'Signups not allowed for otp' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy()
    expect(screen.getByText(/has an account here, a sign-in link is on its way/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).not.toMatch(/signups not allowed/i)
  })

  it('still shows any other refusal, such as too many requests', async () => {
    await askForLink(linkAnswering({ code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Email rate limit exceeded')
  })
})

describe('where an emailed link brings the owner back (PLAN §2.10)', () => {
  const here = window.location.origin

  it.each([
    ['nothing asked', undefined, here],
    ['the consent page', `${here}/oauth/consent?authorization_id=a1`, `${here}/oauth/consent?authorization_id=a1`],
    ['another site', 'https://evil.example/oauth/consent', here],
    ['another site, with no scheme', '//evil.example/oauth/consent', here],
    ['a script', 'javascript:alert(1)', here],
  ])('for %s', (_, asked, back) => {
    expect(returnAddress(asked)).toBe(back)
  })

  it('is what the card asks Supabase to send', async () => {
    const fake = createFakeSupabase()
    const otp = vi.spyOn(fake.client.auth, 'signInWithOtp')
    render(<SignIn supabase={fake.client} returnTo="https://evil.example/oauth/consent" />)
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link instead' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'you@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }))

    await waitFor(() => expect(otp).toHaveBeenCalled())
    expect(otp.mock.calls[0]?.[0]).toMatchObject({ options: { emailRedirectTo: here } })
  })
})

type Listener = (event: string, session: unknown) => void

/** A client whose auth events the test sends, as a recovery link's exchange does. */
function recoveryClient() {
  const listeners: Listener[] = []
  const calls: { reset: Array<[string, unknown]>; update: unknown[] } = { reset: [], update: [] }
  const auth = {
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: (listener: Listener) => {
      listeners.push(listener)
      return { data: { subscription: { unsubscribe: () => undefined } } }
    },
    resetPasswordForEmail: (email: string, options: unknown) => {
      calls.reset.push([email, options])
      return Promise.resolve({ data: {}, error: null })
    },
    updateUser: (attributes: unknown) => {
      calls.update.push(attributes)
      return Promise.resolve({ data: {}, error: null })
    },
    signInWithPassword: () => Promise.resolve({ error: null }),
  }
  const send = (event: string, session: unknown) => {
    for (const listener of listeners) listener(event, session)
  }
  return { client: { auth } as unknown as SupabaseClient, calls, send }
}

function RecoveryGate({ supabase }: { supabase: SupabaseClient }) {
  const session = useSession(supabase)
  if (session.status === 'recovering') return <NewPassword supabase={supabase} />
  if (session.status === 'signed-in') return <p>signed in</p>
  if (session.status === 'signed-out') return <SignIn supabase={supabase} linkRefused={session.linkRefused} />
  return null
}

describe('a forgotten password (security-a-02)', () => {
  it('asks for a reset link through this browser, and reads as a sent link', async () => {
    const fake = recoveryClient()
    render(<SignIn supabase={fake.client} />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: ' owner@example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy()
    expect(fake.calls.reset).toEqual([['owner@example.com', { redirectTo: window.location.origin }]])
  })

  it('opens a new-password form when the reset link signs in, and saves it', async () => {
    const fake = recoveryClient()
    render(<RecoveryGate supabase={fake.client} />)
    await screen.findByRole('button', { name: 'Sign in' })

    const session = { user: { id: 'u1' } }
    act(() => fake.send('PASSWORD_RECOVERY', session))
    // The client's first-session event can come after; it must not skip the form.
    act(() => fake.send('INITIAL_SESSION', session))
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'a-long-generated-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    await waitFor(() => expect(fake.calls.update).toEqual([{ password: 'a-long-generated-password' }]))
    act(() => fake.send('USER_UPDATED', session))
    expect(await screen.findByText('signed in')).toBeTruthy()
  })
})

describe('after signing out on this device only (security-a-06)', () => {
  it('says the other devices may still be signed in, once', async () => {
    window.sessionStorage.setItem('budget.signed-out-here-only', '1')
    render(<SignIn supabase={linkAnswering(null)} />)
    expect(screen.getByText(SIGNED_OUT_HERE_ONLY_NOTE)).toBeTruthy()
    expect(window.sessionStorage.getItem('budget.signed-out-here-only')).toBeNull()
    cleanup()
    render(<SignIn supabase={linkAnswering(null)} />)
    expect(screen.queryByText(SIGNED_OUT_HERE_ONLY_NOTE)).toBeNull()
  })
})
