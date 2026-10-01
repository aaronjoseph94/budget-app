import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthAuthorizationDetails, OAuthRedirect } from '@supabase/supabase-js'
import { Consent, ConsentScreen } from '../src/ai-apps/ConsentScreen.js'
import { isConsentPath } from '../src/ai-apps/consent-path.js'
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
  it('names the app and where it sends the owner, and Allow sends them back to that callback alone', async () => {
    const { fake, go } = await open()

    expect(await screen.findByRole('heading', { level: 1, name: 'Connect an AI app' })).toBeTruthy()
    expect(screen.getByText(/wants to connect to your budget\./).textContent).toBe('“Claude” wants to connect to your budget.')
    expect(screen.getByText('claude.ai').tagName).toBe('STRONG')
    expect(screen.getByText(/Anthropic for Claude, OpenAI for ChatGPT/)).toBeTruthy()
    await expectNoAxeViolations()

    const approve = vi.spyOn(fake.client.auth.oauth, 'approveAuthorization')
    fireEvent.click(allow()!)
    await waitFor(() => expect(go).toHaveBeenCalledWith(`${CLAUDE}?code=fake-code&state=fake-state`))
    // The library itself would follow its answer; the page checks it first.
    expect(approve).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true })
    expect(fake.oauth.consents).toEqual([{ id: 'auth-1', action: 'approve' }])
    // Allow never turns anything on, or moves the window.
    expect(fake.tables.ai_app_access).toEqual([ON])
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
    expect(screen.getByRole('button', { name: 'Deny' })).toBeTruthy()
  })

  it('takes Allow back when the 15 minutes run out while the page is open', async () => {
    const { fake, go } = await open()
    await screen.findByRole('button', { name: 'Allow' })
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 11 * 60_000)

    fireEvent.click(allow()!)
    expect(await screen.findByText(/wasn’t started from the budget app\./)).toBeTruthy()
    expect(allow()).toBeNull()
    expect([fake.oauth.consents, go.mock.calls]).toEqual([[], []])
  })

  it.each([
    ['another page on the same host', `${CLAUDE}/x?code=fake-code`],
    ['another site', 'https://evil.example/?code=fake-code'],
    ['the callback with a fragment', `${CLAUDE}?code=fake-code#more`],
    ['the callback with no query', CLAUDE],
  ])('goes nowhere when Supabase answers Allow with %s', async (_, address) => {
    const { fake, go } = await open()
    fake.oauth.answer = () => address

    fireEvent.click((await screen.findByRole('button', { name: 'Allow' })))
    expect(await screen.findByRole('heading', { level: 1, name: 'Not sent back' })).toBeTruthy()
    expect(go).not.toHaveBeenCalled()
  })

  it('goes nowhere when Supabase answers with another allowed callback than the one named', async () => {
    const { fake, go } = await open({ request: asking('https://chatgpt.com/connector/oauth/abc', 'ChatGPT') })
    fake.oauth.answer = () => 'https://chatgpt.com/connector/oauth/xyz?code=fake-code'

    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Not sent back' })).toBeTruthy()
    expect(go).not.toHaveBeenCalled()
  })

  it('warns that a program on this computer will get the sign-in', async () => {
    await open({ request: asking('http://127.0.0.1:33418/callback') })
    expect(await screen.findByText(/Any program on it could be listening/)).toBeTruthy()
    expect(screen.getByText('127.0.0.1').tagName).toBe('STRONG')
    expect(allow()).toBeTruthy()
  })
})

describe('the consent page: Deny', () => {
  it('refuses an unknown callback and goes nowhere, not even to say no', async () => {
    const { fake, go } = await open({ request: asking('https://evil.example/cb') })
    const deny = vi.spyOn(fake.client.auth.oauth, 'denyAuthorization')

    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Refused' })).toBeTruthy()
    expect(deny).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true })
    expect(fake.oauth.consents).toEqual([{ id: 'auth-1', action: 'deny' }])
    expect(go).not.toHaveBeenCalled()
  })

  it('tells Claude the owner said no', async () => {
    const { go } = await open({ access: { ...ON, enabled: false } })

    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }))
    await waitFor(() => expect(go).toHaveBeenCalledWith(`${CLAUDE}?error=access_denied&state=fake-state`))
  })
})

describe('the consent page: an app allowed before', () => {
  const before: OAuthRedirect = { redirect_url: `${CLAUDE}?code=fake-code&state=fake-state` }

  it('sends the owner straight back while the window is open', async () => {
    const { go } = await open({ request: before })
    await waitFor(() => expect(go).toHaveBeenCalledWith(before.redirect_url))
  })

  it('goes nowhere with the window shut, or to an address not allowed', async () => {
    const shut = await open({ request: before, access: { ...ON, connect_until: minutes(-1) } })
    expect(await screen.findByText(/wasn’t started from the budget app\./)).toBeTruthy()
    cleanup()
    const elsewhere = await open({ request: { redirect_url: 'https://evil.example/cb?code=fake-code' } })
    expect(await screen.findByRole('heading', { level: 1, name: 'Not sent back' })).toBeTruthy()
    expect([shut.go.mock.calls, elsewhere.go.mock.calls]).toEqual([[], []])
  })
})

// main.tsx draws the page in place of the app here. With a trailing slash
// too: if Pages ever needs the build's copy at oauth/consent/index.html (K7),
// it answers /oauth/consent by sending the browser to /oauth/consent/.
describe('the consent page: its address', () => {
  it.each([
    ['/oauth/consent', true],
    ['/oauth/consent/', true],
    ['/', false],
    ['/oauth/consent/x', false],
    ['/oauth/consentx', false],
    ['/oauth/consent//', false],
    ['/x/oauth/consent', false],
  ])('%s is the consent page: %s', (path, is) => {
    expect(isConsentPath(path)).toBe(is)
  })
})

describe('the consent page: what it draws', () => {
  it('draws the app’s name as text, markup and all, and never its address or logo', async () => {
    await open({ request: asking(CLAUDE, '<img src=x onerror=alert(1)>Claude‮') })

    expect((await screen.findByText(/wants to connect/)).textContent).toBe('“<img src=x onerror=alert(1)>Claude” wants to connect to your budget.')
    expect(document.querySelector('img')).toBeNull()
    expect(document.body.innerHTML).not.toContain('evil.example')
  })

  it('says what is missing on a site built without its two public values', async () => {
    render(<ConsentScreen />)
    expect(await screen.findByText('Not configured')).toBeTruthy()
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
