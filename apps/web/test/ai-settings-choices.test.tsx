import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * AI settings' Try in this order (plan §8.3, A11): kept in the owner's
 * ai_settings row, the helper following it from its next call. Without 0016 the panel says so in one
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
})

describe('without the one-time update that holds these choices', () => {
  it('says so in one line pointing to Help, and the rest of AI settings stays', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      const fake = createFakeSupabase()
      fake.fail('ai_settings', code)
      renderScreen(<Shell />, fake)
      const line = await screen.findByText(/^Choosing the order needs a one-time update\./)
      expect(within(line).getByRole('link', { name: 'One-time updates' }).getAttribute('href')).toBe('#/help/updates')
      expect(screen.getByRole('region', { name: 'Free Google Gemini' })).toBeTruthy()
      expect(screen.queryByRole('region', { name: 'Try in this order' })).toBeNull()
      cleanup()
    }
  })
})
