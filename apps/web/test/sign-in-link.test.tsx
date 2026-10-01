import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LINK_REFUSED, SignIn, useSession } from '../src/auth.js'
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

  it('balances the subtitle over its lines, so no word is left alone on the last (V23)', async () => {
    window.history.replaceState(null, '', '/#/month')
    render(<Gate supabase={createFakeSupabase().client} />)
    expect((await screen.findByText('Your statements and your spending, visible only to you.')).className).toContain('text-balance')
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
