import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
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
