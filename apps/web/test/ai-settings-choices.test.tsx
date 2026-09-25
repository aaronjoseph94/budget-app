import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { aiStatusReply, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * AI settings' Try in this order, Use paid services and Daily limit (plan
 * §8.3, A11): each kept in the owner's ai_settings row, the helper
 * following it from its next call. Without 0016 the panel says so in one
 * line and the rest of the page stays.
 */

const TODAY = new Date(2026, 8, 23, 12)

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  go('#/ai')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

async function open(fake: FakeSupabase) {
  renderScreen(<Shell />, fake)
  return within(await screen.findByRole('region', { name: 'Try in this order' }))
}
// Each row's place and name, without its Free or Paid chip.
const names = (order: ReturnType<typeof within>) => order.getAllByRole('listitem').map((li: HTMLElement) => li.querySelector('.font-medium')?.textContent?.replace(/(Free|Paid)$/, ''))

describe('Try in this order', () => {
  it('lists the services in the owner’s saved order, any it leaves out after', async () => {
    const order = await open(createFakeSupabase({ ai_settings: [{ user_id: 'u1', provider_order: ['openrouter', 'gemini'] }] }))
    expect(names(order)).toEqual(['1. OpenRouter', '2. Google Gemini', '3. Groq', '4. OpenAI', '5. Anthropic'])
  })

  it('moves a service up or down, saving the whole order, with nothing to move past either end', async () => {
    const fake = createFakeSupabase()
    const order = await open(fake)
    expect((order.getByRole('button', { name: 'Move Google Gemini up' }) as HTMLButtonElement).disabled).toBe(true)
    expect((order.getByRole('button', { name: 'Move Anthropic down' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(order.getByRole('button', { name: 'Move Groq up' }))
    await waitFor(() => expect(fake.tables.ai_settings).toMatchObject([{ user_id: 'u1', provider_order: ['groq', 'gemini', 'openrouter', 'openai', 'anthropic'] }]))
    expect(names(order)).toEqual(['1. Groq', '2. Google Gemini', '3. OpenRouter', '4. OpenAI', '5. Anthropic'])
    await waitFor(() => expect((order.getByRole('button', { name: 'Move OpenRouter down' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(order.getByRole('button', { name: 'Move OpenRouter down' }))
    await waitFor(() => expect(fake.tables.ai_settings[0]?.provider_order).toEqual(['groq', 'gemini', 'openai', 'openrouter', 'anthropic']))
    // The helper is asked again, so the sentence at the top follows.
    expect(fake.functions.calls.filter((c) => c['action'] === 'status').length).toBeGreaterThan(1)
  })

  it('puts the order back and says so when it could not be saved', async () => {
    const fake = createFakeSupabase()
    const order = await open(fake)
    fake.fail('POST ai_settings', '08006')
    fireEvent.click(order.getByRole('button', { name: 'Move Groq up' }))
    expect(await screen.findByText('Couldn’t save that just now. Try again.')).toBeTruthy()
    expect(names(order)[0]).toBe('1. Google Gemini')
  })
})

describe('Use paid services', () => {
  it('is off until switched on, and the switch is saved', async () => {
    const fake = createFakeSupabase()
    await open(fake)
    const paid = screen.getByRole('switch', { name: 'Use paid services' }) as HTMLInputElement
    expect(paid.checked).toBe(false)
    expect(screen.getByText('Off: OpenAI and Anthropic are never asked, even with a key saved, so nothing is billed.')).toBeTruthy()
    fireEvent.click(paid)
    await waitFor(() => expect(fake.tables.ai_settings).toMatchObject([{ user_id: 'u1', allow_paid: true, daily_cap: 40 }]))
    expect(paid.checked).toBe(true)
    expect(screen.getByText(/^On: OpenAI and Anthropic are asked/)).toBeTruthy()
    await waitFor(() => expect(paid.disabled).toBe(false))
    fireEvent.click(paid)
    await waitFor(() => expect(fake.tables.ai_settings).toMatchObject([{ allow_paid: false }]))
  })
})

describe('Daily limit', () => {
  it('offers 10 to 150 calls a day, saves the choice, and says how many were used today', async () => {
    const fake = createFakeSupabase({ ai_settings: [{ user_id: 'u1', daily_cap: 45 }] })
    fake.functions.aiStatus = aiStatusReply({ today: { used: 7, cap: 45 } })
    await open(fake)
    const cap = screen.getByRole('combobox', { name: 'Daily limit' }) as HTMLSelectElement
    expect(cap.value).toBe('45')
    expect([...cap.options].map((o) => Number(o.value))).toEqual([10, 20, 30, 40, 45, 50, 60, 80, 100, 120, 150])
    expect(screen.getByText('Today: 7 of 45. Resets overnight. Past the limit, the app uses its own words until tomorrow.')).toBeTruthy()
    fireEvent.change(cap, { target: { value: '60' } })
    await waitFor(() => expect(fake.tables.ai_settings).toMatchObject([{ user_id: 'u1', daily_cap: 60 }]))
  })
})

describe('without the one-time update that holds these choices', () => {
  it('says so in one line pointing to Help, and the rest of AI settings stays', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      const fake = createFakeSupabase()
      fake.fail('ai_settings', code)
      renderScreen(<Shell />, fake)
      const line = await screen.findByText(/^Choosing the order, paid services and a daily limit needs a one-time update\./)
      expect(within(line).getByRole('link', { name: 'One-time updates' }).getAttribute('href')).toBe('#/help/updates')
      expect(screen.getByRole('region', { name: 'Free Google Gemini' })).toBeTruthy()
      expect(screen.queryByRole('switch', { name: 'Use paid services' })).toBeNull()
      cleanup()
    }
  })

  it('says it could not load them, with no update to paste, when the connection drops', async () => {
    const fake = createFakeSupabase()
    fake.fail('ai_settings', '08006')
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(/^Couldn’t load your AI choices just now\./)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'One-time updates' })).toBeNull()
  })
})
