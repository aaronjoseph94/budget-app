import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiKeyReply } from '@budget/schema'
import { Shell } from '../src/App.js'
import { aiStatusReply, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * AI settings' other four services (plan §8.3, A11; ADR 0015): Groq and
 * OpenRouter (free) in the Free AI card, OpenAI and Anthropic (paid)
 * folded under Advanced, each with its own get-a-key page, the same paste
 * and test as Gemini's, and Remove key. The key is obviously fake, and
 * must be nowhere on the page once it is sent.
 */

const TODAY = new Date(2026, 8, 23, 12)
const KEY = 'test-not-a-real-key-0001'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeAll(() => warmScreen('#/ai', 'Settings'))

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

const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** Open the page and unfold Advanced; the paid cards are inside it, the free ones in the Free AI card above. */
async function more(fake: FakeSupabase) {
  renderScreen(<Shell />, fake)
  // Advanced is drawn before the helper answers; the cards wait for its status.
  await screen.findByRole('region', { name: 'Free AI' })
  const summary = screen.getByText('Advanced')
  const details = summary.closest('details') as HTMLDetailsElement
  expect(details.open).toBe(false)
  fireEvent.click(summary)
  return (name: string) => within(screen.getByRole('region', { name }))
}

describe('the other four services', () => {
  it('each link to their own key page in a new tab, the free ones in the Free AI card, the paid ones under Advanced', async () => {
    const card = await more(createFakeSupabase())
    const free = screen.getByRole('region', { name: 'Free AI' })
    const advanced = screen.getByText('Advanced').closest('details') as HTMLDetailsElement
    for (const name of ['Groq', 'OpenRouter']) expect(free.contains(screen.getByRole('region', { name }))).toBe(true)
    for (const name of ['OpenAI', 'Anthropic']) expect(advanced.contains(screen.getByRole('region', { name }))).toBe(true)
    const cases = [
      ['Groq', 'Get a free Groq key ↗', 'https://console.groq.com/keys', 'Free'],
      ['OpenRouter', 'Get a free OpenRouter key ↗', 'https://openrouter.ai/settings/keys', 'Free'],
      ['OpenAI', 'Get an OpenAI key ↗', 'https://platform.openai.com/api-keys', 'Paid'],
      ['Anthropic', 'Get an Anthropic key ↗', 'https://platform.claude.com/settings/keys', 'Paid'],
    ] as const
    for (const [name, label, href, tier] of cases) {
      const link = card(name).getByRole('link', { name: label })
      expect([name, link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]).toEqual([name, href, '_blank', 'noopener noreferrer'])
      expect(card(name).getByText(tier)).toBeTruthy()
      expect(card(name).getByLabelText('Step 2: paste it here').getAttribute('type')).toBe('password')
    }
    // Each free card says in a few words that it reads photos and may keep what it is sent (ADR 0004, ADR 0015), and the model it will use.
    expect(card('Groq').getByText('Free and very quick. Reads photos. May keep what it is sent.')).toBeTruthy()
    expect(card('OpenRouter').getByText('Free and quick. Reads photos. May keep what it is sent.')).toBeTruthy()
    expect(card('Groq').getByText('Uses gpt-oss-20b')).toBeTruthy()
    expect(card('OpenRouter').getByText('Uses inkling-small')).toBeTruthy()
    for (const paid of ['OpenAI', 'Anthropic']) expect(card(paid).getByText(/bills you for each use\. Tried only when Use paid services is on\.$/)).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('saves a Groq key for Groq, empties the field, and shows the key nowhere', async () => {
    const fake = createFakeSupabase()
    const models = [{ id: 'openai/gpt-oss-20b', listed: true }, { id: 'openai/gpt-oss-120b', listed: false }]
    fake.functions.ai = (body) =>
      body['action'] === 'status' ? reply(fake.functions.aiStatus) : reply({ ok: true, provider: 'groq', source: 'saved', status: 'ok', hint: '0001', models } satisfies AiKeyReply)
    const groq = (await more(fake))('Groq')
    const field = groq.getByLabelText('Step 2: paste it here') as HTMLInputElement
    fireEvent.change(field, { target: { value: KEY } })
    fireEvent.click(groq.getByRole('button', { name: 'Save & test' }))
    expect(await groq.findByText('Works · key ending …0001')).toBeTruthy()
    expect(fake.functions.calls).toContainEqual({ action: 'save_key', provider: 'groq', key: KEY })
    expect(field.value).toBe('')
    expect(document.body.innerHTML).not.toContain(KEY)
    const model = groq.getByRole('combobox', { name: 'Model' }) as HTMLSelectElement
    expect([...model.options].map((o) => [o.value, o.disabled])).toEqual([['openai/gpt-oss-20b', false], ['openai/gpt-oss-120b', true]])
  })

  it('removes an Anthropic key, and only that service’s', async () => {
    const fake = createFakeSupabase()
    fake.rpcReplies['ai_key_forget'] = true
    fake.functions.aiStatus = aiStatusReply({
      services: aiStatusReply().services.map((s) => (s.provider === 'anthropic' ? { ...s, source: 'saved' as const, hint: 'wxyz', status: 'busy' as const } : s)),
    })
    const anthropic = (await more(fake))('Anthropic')
    fireEvent.click(anthropic.getByRole('button', { name: 'Remove key' }))
    expect(await anthropic.findByText('Key removed.')).toBeTruthy()
    await waitFor(() => expect(fake.rpcCalls).toContainEqual({ name: 'ai_key_forget', args: { p_provider: 'anthropic' } }))
  })

  it('says which company turned a saved key down, with the steps open to paste it again', async () => {
    const fake = createFakeSupabase()
    fake.functions.aiStatus = aiStatusReply({
      services: aiStatusReply().services.map((s) => (s.provider === 'openrouter' ? { ...s, source: 'saved' as const, hint: 'abcd', status: 'rejected' as const } : s)),
    })
    const openrouter = (await more(fake))('OpenRouter')
    expect(openrouter.getByText('OpenRouter turned down your key ending …abcd. Paste it again below.')).toBeTruthy()
    expect(openrouter.getByLabelText('Step 2: paste it here')).toBeTruthy()
  })
})
