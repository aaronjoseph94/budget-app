import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AiAppsCard } from '../src/ai-apps/AiAppsCard.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * Settings → AI apps (PLAN §2.9, ADR 0012): the owner's switch, off until
 * turned on, and whether AI apps may add to Review.
 */
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

afterEach(cleanup)

const connect = () => screen.findByRole<HTMLInputElement>('switch', { name: 'Let AI apps connect' })

describe('Settings → AI apps: the switches', () => {
  it('is off by default, and offers nothing to connect until it is on', async () => {
    const fake = createFakeSupabase()
    renderScreen(<AiAppsCard />, fake)

    expect((await connect()).checked).toBe(false)
    expect(screen.getByText('Off: no AI app can read your figures or add anything.')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Let them add to Review' })).toBeNull()
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

    fireEvent.click(add)
    await waitFor(() => expect(fake.tables.ai_app_access).toMatchObject([{ enabled: true, allow_add: false }]))
    expect(screen.getByText('Off: they can only read. Nothing is added to Review.')).toBeTruthy()

    fireEvent.click(await connect())
    await waitFor(() => expect(fake.tables.ai_app_access).toMatchObject([{ enabled: false, allow_add: false }]))
    expect(screen.queryByRole('switch', { name: 'Let them add to Review' })).toBeNull()
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
