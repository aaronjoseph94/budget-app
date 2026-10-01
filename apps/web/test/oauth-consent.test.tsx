import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthAuthorizationDetails, OAuthRedirect } from '@supabase/supabase-js'
import { Consent } from '../src/ai-apps/ConsentScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * The page Supabase sends an AI app's sign-in to (PLAN §2.10, ADR 0012).
 * Allow shows only with an allowed callback, AI apps on and a window the
 * owner opened in the last 15 minutes; the page leaves only for the
 * callback it named; an unknown callback's Deny goes nowhere.
 */
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback'
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0)
const minutes = (n: number) => new Date(NOW + n * 60_000).toISOString()

function asking(redirect_uri = CLAUDE, name = 'Claude'): OAuthAuthorizationDetails {
  return {
    authorization_id: 'auth-1',
    redirect_uri,
    client: { id: 'c-1', name, uri: 'https://evil.example/home', logo_uri: 'https://evil.example/logo.png' },
    user: { id: 'u1', email: 'you@example.com' },
    scope: 'email',
  }
}

type Saved = { user_id: string; enabled: boolean; allow_add: boolean; time_zone: string; connect_until: string | null }
const ON: Saved = { user_id: 'u1', enabled: true, allow_add: true, time_zone: 'UTC', connect_until: minutes(10) }

async function open({ request = asking() as OAuthAuthorizationDetails | OAuthRedirect, access = ON as Saved | null, id = 'auth-1', signedIn = true } = {}) {
  const fake = createFakeSupabase({ ai_app_access: access === null ? [] : [access] })
  fake.oauth.requests['auth-1'] = request
  if (signedIn) await fake.signIn()
  window.history.replaceState(null, '', `/oauth/consent?authorization_id=${id}`)
  const go = vi.fn<(url: string) => void>()
  render(<Consent supabase={fake.client} go={go} />)
  return { fake, go }
}

const allow = () => screen.queryByRole('button', { name: 'Allow' })

beforeEach(() => void vi.spyOn(Date, 'now').mockReturnValue(NOW))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('the consent page: Allow', () => {
  it('names the app and where it sends the owner', async () => {
    await open()

    expect(await screen.findByRole('heading', { level: 1, name: 'Connect an AI app' })).toBeTruthy()
    expect(screen.getByText(/wants to connect to your budget\./).textContent).toBe('“Claude” wants to connect to your budget.')
    expect(screen.getByText('claude.ai').tagName).toBe('STRONG')
    expect(screen.getByText(/Anthropic for Claude, OpenAI for ChatGPT/)).toBeTruthy()
    await expectNoAxeViolations()
  })

  it.each([
    ['a callback that is not Claude’s or ChatGPT’s', { request: asking('https://evil.example/cb') }, /which is not Claude or ChatGPT, so the budget app refused it\./],
    ['AI apps off', { access: { ...ON, enabled: false } }, /AI apps are switched off in the budget app\./],
    ['no AI apps settings saved', { access: null }, /AI apps are switched off in the budget app\./],
    ['Connect a new AI app pressed over 15 minutes ago', { access: { ...ON, connect_until: minutes(-1) } }, /wasn’t started from the budget app\./],
    ['Connect a new AI app never pressed', { access: { ...ON, connect_until: null } }, /wasn’t started from the budget app\./],
  ] as const)('offers no Allow with %s, and says why', async (_, over, why) => {
    await open(over)

    expect(await screen.findByText(why)).toBeTruthy()
    expect(allow()).toBeNull()
  })

  it('warns that a program on this computer will get the sign-in', async () => {
    await open({ request: asking('http://127.0.0.1:33418/callback') })
    expect(await screen.findByText(/Any program on it could be listening/)).toBeTruthy()
    expect(screen.getByText('127.0.0.1').tagName).toBe('STRONG')
  })
})

describe('the consent page: what it draws', () => {
  it('draws the app’s name as text, markup and all, and never its address or logo', async () => {
    await open({ request: asking(CLAUDE, '<img src=x onerror=alert(1)>Claude‮') })

    expect((await screen.findByText(/wants to connect/)).textContent).toBe('“<img src=x onerror=alert(1)>Claude” wants to connect to your budget.')
    expect(document.querySelector('img')).toBeNull()
    expect(document.body.innerHTML).not.toContain('evil.example')
  })

  it('says a request Supabase no longer has has expired', async () => {
    await open({ id: 'auth-2' })
    expect(await screen.findByRole('heading', { level: 1, name: 'This request has expired' })).toBeTruthy()
  })

  it('never sends Supabase an id that is not one', async () => {
    const fake = createFakeSupabase()
    const details = vi.spyOn(fake.client.auth.oauth, 'getAuthorizationDetails')
    await fake.signIn()
    window.history.replaceState(null, '', '/oauth/consent?authorization_id=..%2F..%2Fuser')
    render(<Consent supabase={fake.client} go={vi.fn()} />)

    expect(await screen.findByRole('heading', { level: 1, name: 'This isn’t a connection request' })).toBeTruthy()
    expect(details).not.toHaveBeenCalled()
  })

  it('asks the owner to sign in first, and brings an emailed link back here', async () => {
    const { fake } = await open({ signedIn: false })
    const otp = vi.spyOn(fake.client.auth, 'signInWithOtp')

    fireEvent.click(await screen.findByRole('button', { name: 'Email me a link instead' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'you@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }))
    await waitFor(() => expect(otp).toHaveBeenCalled())
    expect(otp.mock.calls[0]?.[0]).toMatchObject({ options: { emailRedirectTo: `${window.location.origin}/oauth/consent?authorization_id=auth-1` } })
    await expectNoAxeViolations()
  })
})
