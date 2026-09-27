import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

/**
 * AI settings' How the Coach talks (plan §8.3, A12): the tone and Share
 * shop names, kept in the owner's ai_settings row beside A11's choices,
 * and shown even when the AI helper is not installed.
 */
function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeAll(() => warmScreen('#/ai', 'AI settings'))

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  go('#/ai')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location.hash = ''
})

async function open(fake: FakeSupabase) {
  renderScreen(<Shell />, fake)
  return within(await screen.findByRole('region', { name: 'How the Coach talks' }))
}

describe('How the Coach talks', () => {
  it('cheers you on and shares shop names until the owner chooses otherwise', async () => {
    const panel = await open(createFakeSupabase())
    expect((await panel.findByRole<HTMLInputElement>('radio', { name: /Cheerleader/ })).checked).toBe(true)
    expect(panel.getByRole<HTMLInputElement>('radio', { name: /Straight talker/ }).checked).toBe(false)
    expect(panel.getByRole<HTMLInputElement>('switch', { name: 'Share shop names with the AI' }).checked).toBe(true)
    expect(panel.getByRole('link', { name: 'What the AI sees' }).getAttribute('href')).toBe('#/help/ai-sees')
  })

  it('reads back what the owner chose', async () => {
    const panel = await open(createFakeSupabase({ ai_settings: [{ user_id: 'u1', tone: 'straight', share_shop_names: false }] }))
    expect((await panel.findByRole<HTMLInputElement>('radio', { name: /Straight talker/ })).checked).toBe(true)
    expect(panel.getByRole<HTMLInputElement>('switch', { name: 'Share shop names with the AI' }).checked).toBe(false)
  })

  it('saves the tone and the sharing in the owner’s row, keeping A11’s choices', async () => {
    const fake = createFakeSupabase({ ai_settings: [{ user_id: 'u1', daily_cap: 60, tone: 'cheerleader' }] })
    const panel = await open(fake)
    fireEvent.click(await panel.findByRole('radio', { name: /Straight talker/ }))
    await waitFor(() => expect(fake.tables.ai_settings).toEqual([{ user_id: 'u1', daily_cap: 60, tone: 'straight', share_shop_names: true }]))
    await waitFor(() => expect(panel.getByRole<HTMLInputElement>('switch', { name: 'Share shop names with the AI' }).disabled).toBe(false))
    fireEvent.click(panel.getByRole('switch', { name: 'Share shop names with the AI' }))
    await waitFor(() => expect(fake.tables.ai_settings).toEqual([{ user_id: 'u1', daily_cap: 60, tone: 'straight', share_shop_names: false }]))
    expect(panel.getByText(/the AI is told “a shop” instead of the name, and Review suggests no categories/)).toBeTruthy()
  })

  it('shows what is stored when a save fails', async () => {
    const fake = createFakeSupabase()
    fake.fail('POST ai_settings', '08006')
    const panel = await open(fake)
    fireEvent.click(await panel.findByRole('radio', { name: /Straight talker/ }))
    expect(await panel.findByText('Couldn’t save that just now. Try again.')).toBeTruthy()
    expect(panel.getByRole<HTMLInputElement>('radio', { name: /Cheerleader/ }).checked).toBe(true)
  })

  it('is there with no AI helper, and says in one line when 0016 is not in', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = null
    fake.fail('ai_settings', 'PGRST205')
    const panel = await open(fake)
    expect(await panel.findByText(/Choosing the Coach’s tone needs a one-time update/)).toBeTruthy()
    expect(panel.getByRole('link', { name: 'One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(await screen.findByText(/The AI helper isn’t installed yet/)).toBeTruthy()
  })
})
