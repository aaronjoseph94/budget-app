import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { OAuthGrant } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiAppsCard } from '../src/ai-apps/AiAppsCard.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * Settings → AI apps (PLAN §2.9, ADR 0012): the owner's switch, off until
 * turned on, whether AI apps may add to Review, the server's address and
 * Connect a new AI app, which opens the 15 minutes in which the consent
 * page allows a new connection.
 */
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
const ADDRESS = 'http://fake.supabase.test/functions/v1/mcp'
const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const connect = () => screen.findByRole<HTMLInputElement>('switch', { name: 'Let AI apps connect' })

describe('Settings → AI apps: the switches', () => {
  it('is off by default, and offers nothing to connect until it is on', async () => {
    const fake = createFakeSupabase()
    renderScreen(<AiAppsCard />, fake)

    expect((await connect()).checked).toBe(false)
    expect(screen.getByText('Off: no AI app can read your figures or add anything.')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Let them add to Review' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connect a new AI app' })).toBeNull()
    expect(fake.tables.ai_app_access).toEqual([])
    await expectNoAxeViolations()
  })

  it('turns AI apps on with the browser’s time zone, then adding is on too', async () => {
    const fake = createFakeSupabase()
    renderScreen(<AiAppsCard />, fake)

    fireEvent.click(await connect())
    await waitFor(() => expect(fake.tables.ai_app_access).toMatchObject([{ user_id: 'u1', enabled: true, time_zone: ZONE }]))
    const add = await screen.findByRole<HTMLInputElement>('switch', { name: 'Let them add to Review' })
    expect(add.checked).toBe(true)
    expect(screen.getByText(ADDRESS)).toBeTruthy()

    fireEvent.click(add)
    await waitFor(() => expect(fake.tables.ai_app_access).toMatchObject([{ enabled: true, allow_add: false }]))
    expect(screen.getByText('Off: they can only read. Nothing is added to Review.')).toBeTruthy()

    fireEvent.click(await connect())
    await waitFor(() => expect(fake.tables.ai_app_access).toMatchObject([{ enabled: false, allow_add: false }]))
    expect(screen.queryByRole('switch', { name: 'Let them add to Review' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connect a new AI app' })).toBeNull()
    await expectNoAxeViolations()
  })

  it('shows the switch as it was stored when the save fails, and says so', async () => {
    const fake = createFakeSupabase()
    fake.fail('POST ai_app_access', '08006')
    renderScreen(<AiAppsCard />, fake)

    fireEvent.click(await connect())
    expect(await screen.findByText('Couldn’t save that just now. Try again.')).toBeTruthy()
    expect((await connect()).checked).toBe(false)
    expect(fake.tables.ai_app_access).toEqual([])
  })

  it('says in one line when the one-time update is not in yet', async () => {
    const fake = createFakeSupabase()
    fake.fail('ai_app_access', 'PGRST205')
    renderScreen(<AiAppsCard />, fake)

    expect(await screen.findByText(/AI apps need a one-time update first\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(screen.queryByRole('switch')).toBeNull()
  })
})

describe('Settings → AI apps: Connect a new AI app', () => {
  const on = () => createFakeSupabase({ ai_app_access: [{ user_id: 'u1', enabled: true, allow_add: true, time_zone: 'UTC', connect_until: null }] })

  it('copies the address and opens the next 15 minutes for a new connection', async () => {
    const fake = on()
    renderScreen(<AiAppsCard />, fake)
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 1, 12, 0, 0))

    fireEvent.click(await screen.findByRole('button', { name: 'Connect a new AI app' }))
    await waitFor(() => expect(fake.tables.ai_app_access).toMatchObject([{ enabled: true, connect_until: '2026-10-01T12:15:00.000Z' }]))
    expect(writeText).toHaveBeenCalledWith(ADDRESS)
    expect(await screen.findByText('Copied. Paste it in Claude or ChatGPT within 15 minutes.')).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('still opens the 15 minutes when the browser will not copy, and says to copy it by hand', async () => {
    writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const fake = on()
    renderScreen(<AiAppsCard />, fake)

    fireEvent.click(await screen.findByRole('button', { name: 'Connect a new AI app' }))
    expect(
      await screen.findByText('Your browser didn’t allow copying. Copy the address above by hand, then paste it in Claude or ChatGPT within 15 minutes.'),
    ).toBeTruthy()
    expect(fake.tables.ai_app_access[0]?.connect_until).not.toBeNull()
  })

  it('says Claude or ChatGPT would be turned away when the 15 minutes could not be opened', async () => {
    const fake = on()
    renderScreen(<AiAppsCard />, fake)
    const button = await screen.findByRole('button', { name: 'Connect a new AI app' })
    fake.fail('POST ai_app_access', '08006')

    fireEvent.click(button)
    expect(
      await screen.findByText('Couldn’t open a new connection just now, so Claude or ChatGPT would be turned away. Check your connection and try again.'),
    ).toBeTruthy()
    expect(screen.queryByText(/Copied/)).toBeNull()
    expect(fake.tables.ai_app_access[0]?.connect_until).toBeNull()
  })
})

describe('Settings → AI apps: connected apps and Disconnect', () => {
  const grant = (id: string, name: string, granted_at: string): OAuthGrant => ({
    client: { id, name, uri: 'https://evil.example/home', logo_uri: 'https://evil.example/logo.png' },
    scopes: ['email'],
    granted_at,
  })
  async function connected(on = true) {
    const fake = createFakeSupabase({
      ai_app_access: [{ user_id: 'u1', enabled: on, allow_add: true, time_zone: 'UTC', connect_until: null }],
      ai_app_last_use: [{ user_id: 'u1', client_id: 'id-claude', last_used_at: '2026-10-01T12:00:00Z' }],
    })
    fake.oauth.grants = [grant('id-claude', 'Claude', '2026-09-30T12:00:00Z'), grant('id-other', '<img src=x>‮tpGtahC', '2026-09-29T12:00:00Z')]
    await fake.signIn()
    renderScreen(<AiAppsCard />, fake)
    return fake
  }
  const rows = () => within(screen.getByRole('list')).getAllByRole('listitem')

  it('lists each by the name it was given, as text, with when it was connected and last asked', async () => {
    await connected()

    expect(await screen.findByRole('heading', { name: 'Connected apps' })).toBeTruthy()
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(rows()[0]?.textContent).toBe('ClaudeConnected 30 Sep 2026 · Last asked 1 Oct 2026Disconnect')
    // Markup is text, and a direction override is dropped, so the name reads as it is stored.
    expect(rows()[1]?.textContent).toBe('<img src=x>tpGtahCConnected 29 Sep 2026 · Not used yetDisconnect')
    expect(document.querySelector('img')).toBeNull()
    // The registrant's own address and logo are never drawn or fetched.
    expect(document.body.innerHTML).not.toContain('evil.example')
    await expectNoAxeViolations()
  })

  it('disconnects one only once asked, and lists what is left', async () => {
    const fake = await connected()

    const claude = await waitFor(() => rows()[0]!)
    fireEvent.click(within(claude).getByRole('button', { name: 'Disconnect' }))
    expect(within(claude).getByText(/It has to sign in again to come back/)).toBeTruthy()
    fireEvent.click(within(claude).getByRole('button', { name: 'Keep it' }))
    expect(fake.oauth.revoked).toEqual([])

    fireEvent.click(within(claude).getByRole('button', { name: 'Disconnect' }))
    fireEvent.click(within(claude).getByRole('button', { name: 'Yes, disconnect' }))
    expect(await screen.findByText('Disconnected “Claude”. It has to sign in again to come back.')).toBeTruthy()
    expect(fake.oauth.revoked).toEqual(['id-claude'])
    expect(rows().map((r) => r.querySelector('bdi')?.textContent)).toEqual(['<img src=x>tpGtahC'])
  })

  it('still lists a connected app with AI apps off, so it can be disconnected', async () => {
    await connected(false)
    await waitFor(() => expect(rows()).toHaveLength(2))
  })

  it('says sign-in for AI apps is not on yet, and says nothing of it while AI apps are off', async () => {
    const fake = createFakeSupabase({ ai_app_access: [{ user_id: 'u1', enabled: true, allow_add: true, time_zone: 'UTC', connect_until: null }] })
    await fake.signIn()
    renderScreen(<AiAppsCard />, fake)
    expect(await screen.findByText(/Sign-in for AI apps is not switched on in Supabase yet\./)).toBeTruthy()

    cleanup()
    renderScreen(<AiAppsCard />, createFakeSupabase())
    expect(await connect()).toBeTruthy()
    expect(screen.queryByText(/Sign-in for AI apps/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Connected apps' })).toBeNull()
  })

  it('lists them before the one-time update, without when each last asked', async () => {
    const fake = await connected()
    fake.fail('ai_app_last_use', 'PGRST205')
    cleanup()
    renderScreen(<AiAppsCard />, fake)
    await waitFor(() => expect(rows()[0]?.textContent).toBe('ClaudeConnected 30 Sep 2026Disconnect'))
  })
})
