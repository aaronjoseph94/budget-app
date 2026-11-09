import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * "You're offline: figures may be out of date" is switched on
 * by any request of the Supabase client that gets no reply (offline.tsx,
 * watchNetwork), and off only by the next request that gets one.
 *
 * A browser gets no reply from an Edge Function that is not deployed: the
 * platform answers the permission request with 404, the browser refuses it,
 * and fetch rejects (NOTICED N177, seen by the owner in Safari on
 * 2026-10-16; the fake models it as `functions.inBrowser`). So with the AI
 * helper not installed, opening a screen that asks the helper last says
 * the phone is offline, over figures that were all just read from the
 * server, and keeps saying it until some other request happens to be made.
 */

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)
const LINE = 'You’re offline: figures may be out of date'
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('the offline line, with the server answering every read', () => {
  it.each(['#/coach', '#/review'])('does not say offline on %s because the AI helper is not installed', async (hash) => {
    const fake = createFakeSupabase({
      categories: [{ id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }],
      ingest_candidates: [
        { id: 'r1', posted_on: '2026-09-20', amount_cents: -1250, merchant: 'CAFE', merchant_raw: 'CAFE', status: 'pending', category_id: null, category_source: null, source: 'card_csv', batch_id: 'b1' },
      ],
    })
    // The helper was never deployed, reached as a browser reaches it.
    fake.functions.ai = null
    fake.functions.inBrowser = true
    await fake.signIn()
    window.location.hash = hash
    renderScreen(<Shell />, fake)
    await screen.findAllByRole('navigation', { name: 'Screens' })
    // Long enough for the screen's reads and its question to the helper to settle.
    await pause(1500)

    // The server is there and answered every read; the phone is online.
    expect(fake.server.offline).toBe(false)
    expect(navigator.onLine).toBe(true)
    expect(screen.queryByText(LINE)).toBeNull()
  })
})
