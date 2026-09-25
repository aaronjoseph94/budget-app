import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { aiStatusReply, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
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

const json = (body: unknown, status: number) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function open(fake: FakeSupabase, sentence: string) {
  renderScreen(<Shell />, fake)
  await screen.findByRole('heading', { level: 1, name: 'AI settings' })
  return screen.findByText(sentence)
}

describe('AI settings says what is true, whatever the helper does', () => {
  it('says the helper is not installed yet, and opens One-time updates', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = null
    await open(fake, 'The AI helper isn’t installed yet. Everything else works. One-time updates shows how.')
    expect(screen.getByRole('link', { name: 'Open One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(screen.queryByRole('region', { name: /AI services/ })).toBeNull()
  })

  it('says a one-time update is needed when 0016 is not in', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = json({ ok: false, code: 'needs_update' }, 503)
    await open(fake, 'AI needs a one-time update. Everything else works. One-time updates shows which.')
    expect(screen.getByRole('link', { name: 'Open One-time updates' })).toBeTruthy()
  })

  it('says it could not reach the helper when the phone is offline, with no link to follow', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = () => Promise.reject(new TypeError('Failed to fetch'))
    await open(fake, 'Couldn’t reach the AI helper. Check your connection and try again; everything else still works.')
    expect(screen.queryByRole('link', { name: /One-time updates|Show me how/ })).toBeNull()
  })

  it('says AI is not set up, with each service and today’s calls, when no key is anywhere', async () => {
    await open(createFakeSupabase(), 'AI isn’t set up yet. Everything still works in the app’s own words. Turn on free AI below, in about 2 minutes.')
    expect(screen.getByRole('link', { name: 'Show me how' }).getAttribute('href')).toBe('#/help/free-ai')
    const services = within(await screen.findByRole('region', { name: 'Try in this order' }))
    expect(services.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '1. Google GeminiFreeNo key yet↑↓', '2. GroqFreeNo key yet↑↓', '3. OpenRouterFreeNo key yet↑↓', '4. OpenAIPaidNo key yet↑↓', '5. AnthropicPaidNo key yet↑↓',
    ])
    expect(screen.getByText('Today: 0 of 40 AI calls. Resets overnight.')).toBeTruthy()
  })

  it('says AI is on with the receipts key, showing only its last four characters', async () => {
    const fake = createFakeSupabase()
    fake.functions.aiStatus = aiStatusReply({
      services: aiStatusReply().services.map((s) => (s.provider === 'gemini' ? { ...s, source: 'secret' as const, hint: '<b>1' } : s)),
      today: { used: 3, cap: 40 },
    })
    await open(fake, 'AI is on, using your receipts key.')
    // Whatever the hint holds is drawn as text, never markup.
    expect(await screen.findByText('Your receipts key ending …<b>1, from Supabase')).toBeTruthy()
    expect(screen.getByText('Today: 3 of 40 AI calls. Resets overnight.')).toBeTruthy()
  })

  it('asks again on Check again, showing the newest answer', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = null
    await open(fake, 'The AI helper isn’t installed yet. Everything else works. One-time updates shows how.')
    fake.functions.ai = json({ ok: false, code: 'needs_update' }, 503)
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('AI needs a one-time update. Everything else works. One-time updates shows which.')).toBeTruthy()
    expect(fake.functions.calls).toEqual([{ action: 'status' }, { action: 'status' }])
  })
})

describe('the rest of the app does not ask the helper anything', () => {
  it('opens the Month, and comes back to it from AI settings, with the helper missing', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = null
    go('#/month')
    renderScreen(<Shell />, fake)
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
    expect(fake.functions.calls).toEqual([])
    go('#/ai')
    await screen.findByText(/isn’t installed yet/)
    go('#/month')
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
    await waitFor(() => expect(fake.functions.calls).toHaveLength(1))
  })
})
