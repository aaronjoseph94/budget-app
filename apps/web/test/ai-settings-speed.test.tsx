import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { aiStatusReply, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * Test on a service's card (ADR 0015): one real call on that service
 * alone, timed by the helper, so the owner can see from their own phone
 * which service is quick. Shown only where there is a key to test.
 */

const TODAY = new Date(2026, 8, 23, 12)

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

/** A helper with a Gemini key saved, answering a run with `answer`. */
function withKey(fake: FakeSupabase, answer: () => Response) {
  fake.functions.aiStatus = aiStatusReply({
    services: aiStatusReply().services.map((s) => (s.provider === 'gemini' ? { ...s, source: 'saved' as const, hint: '0001', status: 'ok' as const } : s)),
  })
  fake.functions.ai = (body) => (body['action'] === 'run' ? answer() : reply(fake.functions.aiStatus))
}

async function gemini(fake: FakeSupabase) {
  renderScreen(<Shell />, fake)
  return within(await screen.findByRole('region', { name: 'Free Google Gemini' }))
}

describe('Test', () => {
  it('runs the helper’s test on that service alone, and says how long it took and on which model', async () => {
    const fake = createFakeSupabase()
    withKey(fake, () => reply({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: '{"ok":true}', ms: 940 }))
    const card = await gemini(fake)
    fireEvent.click(card.getByRole('button', { name: 'Test' }))
    expect(await card.findByText('Last test: 0.9 s on Google Gemini · gemini-3.5-flash-lite')).toBeTruthy()
    expect(fake.functions.calls.filter((c) => c['action'] === 'run')).toEqual([{ action: 'run', task: 'test', provider: 'gemini' }])
    await expectNoAxeViolations()
  })

  it('says in a few words when the service did not answer', async () => {
    const fake = createFakeSupabase()
    withKey(fake, () => reply({ ok: false, code: 'all_failed', tried: [{ provider: 'gemini', model: 'gemini-3.5-flash-lite', result: 'timeout', ms: 20_000 }] }, 502))
    const card = await gemini(fake)
    fireEvent.click(card.getByRole('button', { name: 'Test' }))
    expect(await card.findByText('Google Gemini didn’t answer. Try again.')).toBeTruthy()
  })

  it('is not offered where there is no key to test', async () => {
    const card = await gemini(createFakeSupabase())
    expect(card.queryByRole('button', { name: 'Test' })).toBeNull()
  })
})
