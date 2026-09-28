import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiKeyReply, AiServiceStatus } from '@budget/schema'
import { Shell } from '../src/App.js'
import { aiStatusReply, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * AI settings' free Gemini card (plan §8.3, A10): get a key, paste it,
 * Save & test; Already on with the receipts key; Check which models work;
 * Remove key; and a model from those the key can use. The key is
 * obviously fake, and must be nowhere on the page once it is sent.
 */

const TODAY = new Date(2026, 8, 23, 12)
const KEY = 'test-not-a-real-key-0001'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeAll(() => warmScreen('#/ai', 'AI settings'))

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

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const MODELS = [
  { id: 'gemini-3.5-flash-lite', listed: true },
  { id: 'gemini-3.1-flash-lite', listed: true },
  { id: 'gemini-3.5-flash', listed: false },
]
const keyReply = (over: Partial<AiKeyReply> = {}): AiKeyReply => ({
  ok: true, provider: 'gemini', source: 'saved', status: 'ok', hint: '0001', models: MODELS, ...over,
})

/** A helper whose Gemini line is `gemini`, answering save_key and test_key with `answer`. */
function helper(fake: FakeSupabase, gemini: Partial<AiServiceStatus>, answer: () => Response) {
  fake.functions.aiStatus = aiStatusReply({
    services: aiStatusReply().services.map((s) => (s.provider === 'gemini' ? { ...s, ...gemini } : s)),
  })
  fake.functions.ai = (body) => (body['action'] === 'status' ? reply(fake.functions.aiStatus) : answer())
}

async function open(fake: FakeSupabase) {
  renderScreen(<Shell />, fake)
  return within(await screen.findByRole('region', { name: 'Free Google Gemini' }))
}

async function paste(card: Awaited<ReturnType<typeof open>>, key: string) {
  const field = card.getByLabelText('Step 2: paste it here') as HTMLInputElement
  fireEvent.change(field, { target: { value: key } })
  fireEvent.click(card.getByRole('button', { name: 'Save & test' }))
  return field
}

describe('the free Gemini card, with no key yet', () => {
  it('gives the three steps, with a key field that is private, unzoomed and not autocorrected', async () => {
    const card = await open(createFakeSupabase())
    const link = card.getByRole('link', { name: 'Get a free key ↗' })
    expect([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]).toEqual([
      'https://aistudio.google.com/apikey', '_blank', 'noopener noreferrer',
    ])
    const field = card.getByLabelText('Step 2: paste it here')
    expect(field.getAttribute('type')).toBe('password')
    for (const [name, value] of [['autocomplete', 'off'], ['autocapitalize', 'none'], ['autocorrect', 'off'], ['spellcheck', 'false']]) {
      expect(field.getAttribute(name!)).toBe(value)
    }
    expect(field.className).toContain('text-base')
    fireEvent.click(card.getByRole('button', { name: 'Show' }))
    expect(field.getAttribute('type')).toBe('text')
    expect(card.queryByRole('button', { name: 'Remove key' })).toBeNull()
    await expectNoAxeViolations()
  })

  it('sends the key once, empties the field, says it works, and never shows the key', async () => {
    const fake = createFakeSupabase()
    helper(fake, {}, () => {
      fake.functions.aiStatus = aiStatusReply({ services: aiStatusReply().services.map((s) => (s.provider === 'gemini' ? { ...s, source: 'saved', hint: '0001', status: 'ok' } : s)) })
      return reply(keyReply())
    })
    const card = await open(fake)
    const field = await paste(card, `  ${KEY} `)
    expect(field.value).toBe('')
    await card.findByText('Works · key ending …0001')
    expect(fake.functions.calls.filter((c) => c['action'] === 'save_key')).toEqual([{ action: 'save_key', provider: 'gemini', key: KEY }])
    expect(document.body.innerHTML).not.toContain('real-key')
    // The page reads the helper again, so the top sentence follows.
    await screen.findByText('AI is on, using free Google Gemini.')
    expect(card.getByRole('button', { name: 'Remove key' })).toBeTruthy()
  })

  it('points to One-time updates when the helper needs one, and the rest of the page stays', async () => {
    const fake = createFakeSupabase()
    helper(fake, {}, () => reply({ ok: false, code: 'needs_update' }, 503))
    const card = await open(fake)
    await paste(card, KEY)
    await card.findByText('AI needs a one-time update. Everything else works. One-time updates shows which.')
    expect(card.getByRole('link', { name: 'Open One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(await screen.findByRole('region', { name: 'Try in this order' })).toBeTruthy()
  })
})

describe('the free Gemini card, with an older helper', () => {
  it('asks for the helper’s new version instead of a key it could not take, and the rest of the page stays', async () => {
    const fake = createFakeSupabase()
    fake.functions.aiStatus = aiStatusReply({ version: '2026-09-25.1' })
    const card = await open(fake)
    expect(card.getByText('The AI helper you installed is an older copy, so it can’t take a key yet. Everything else works.')).toBeTruthy()
    expect(card.getByRole('link', { name: 'Open One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(card.queryByLabelText('Step 2: paste it here')).toBeNull()
    expect(await screen.findByRole('region', { name: 'Try in this order' })).toBeTruthy()
  })
})

describe('the free Gemini card, with a key', () => {
  it('says Already on with the receipts key, and checks which models work', async () => {
    const fake = createFakeSupabase()
    helper(fake, { source: 'secret', hint: '0002' }, () => reply(keyReply({ source: 'secret', hint: '0002' })))
    const card = await open(fake)
    expect(card.getByText(/Already on/).parentElement?.textContent).toContain('your receipts key ending …0002')
    expect(card.queryByRole('button', { name: 'Remove key' })).toBeNull()
    // With a key, the three steps fold away under one line.
    expect((card.getByText('Paste a different key').closest('details') as HTMLDetailsElement).open).toBe(false)
    fireEvent.click(card.getByRole('button', { name: 'Check which models work' }))
    await card.findByText('Works · your receipts key ending …0002')
    expect(fake.functions.calls.filter((c) => c['action'] === 'test_key')).toEqual([{ action: 'test_key', provider: 'gemini' }])
  })

  it('offers only the models the key can use, and keeps the choice in ai_settings', async () => {
    const fake = createFakeSupabase()
    helper(fake, { source: 'saved', hint: '0001', status: 'ok' }, () => reply(keyReply()))
    const card = await open(fake)
    fireEvent.click(card.getByRole('button', { name: 'Check which models work' }))
    const model = (await card.findByLabelText('Model')) as HTMLSelectElement
    expect([...model.options].map((o) => [o.textContent, o.disabled])).toEqual([
      ['gemini-3.5-flash-lite', false],
      ['gemini-3.1-flash-lite', false],
      ['gemini-3.5-flash (not available for this key)', true],
    ])
    fireEvent.change(model, { target: { value: 'gemini-3.1-flash-lite' } })
    await waitFor(() => expect(fake.tables.ai_settings).toMatchObject([{ user_id: 'u1', models: { gemini: 'gemini-3.1-flash-lite' } }]))
  })

  it('says a locked key must be pasted again', async () => {
    const fake = createFakeSupabase()
    helper(fake, { source: 'saved', hint: '0001', status: 'locked' }, () => reply(keyReply({ status: 'locked', models: [] })))
    const card = await open(fake)
    fireEvent.click(card.getByRole('button', { name: 'Check which models work' }))
    await card.findByText('Your saved key can’t be opened after a Supabase key change: paste it again')
  })

  it('says on opening that a turned-down or locked key must be pasted again, with the steps open', async () => {
    for (const [status, said] of [
      ['rejected', 'Google turned down your key ending …0001. Paste it again below.'],
      ['locked', 'Your key ending …0001 can’t be opened after a Supabase key change. Paste it again below.'],
    ] as const) {
      const fake = createFakeSupabase()
      helper(fake, { source: 'saved', hint: '0001', status }, () => reply(keyReply()))
      const card = await open(fake)
      expect(card.getByText(said)).toBeTruthy()
      expect(card.queryByText('Paste a different key')).toBeNull()
      expect(card.getByLabelText('Step 2: paste it here')).toBeTruthy()
      cleanup()
    }
  })

  it('removes the key through ai_key_forget, and says so', async () => {
    const fake = createFakeSupabase()
    fake.rpcReplies['ai_key_forget'] = true
    helper(fake, { source: 'saved', hint: '0001', status: 'ok' }, () => reply(keyReply()))
    const card = await open(fake)
    fireEvent.click(card.getByRole('button', { name: 'Remove key' }))
    await card.findByText('Key removed.')
    expect(fake.rpcCalls.filter((c) => c.name === 'ai_key_forget').map((c) => c.args)).toEqual([{ p_provider: 'gemini' }])
  })

  it('says Remove key needs a one-time update when 0016’s function is not there', async () => {
    const fake = createFakeSupabase()
    helper(fake, { source: 'saved', hint: '0001', status: 'ok' }, () => reply(keyReply()))
    const card = await open(fake)
    fireEvent.click(card.getByRole('button', { name: 'Remove key' }))
    await card.findByText('AI needs a one-time update. Everything else works. One-time updates shows which.')
  })
})
