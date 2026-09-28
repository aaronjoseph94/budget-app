import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { OfflineBanner } from '../src/offline.js'
import { createSupabase } from '../src/supabase.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)
const LINE = 'You’re offline: figures may be out of date'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.location.hash = ''
})

describe('the offline line (plan §9, A26)', () => {
  it('shows above the screen as soon as a read gets no reply, and goes once one does', async () => {
    const fake = createFakeSupabase()
    fake.server.offline = true
    renderScreen(<Shell />, fake)

    // supabase-js tries a read again after 1, 2 and 4 seconds before it
    // fails, so the line is the first thing to say anything, well before
    // the screen's own Try again.
    expect(await screen.findByText(LINE)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()

    fake.server.offline = false
    // The first retry is a second after the failure: the wait is the
    // client's own backoff, not slack for a slow test.
    expect(await screen.findByRole('heading', { name: 'September 2026' }, { timeout: 3000 })).toBeTruthy()
    expect(screen.queryByText(LINE)).toBeNull()
  })

  it('stays away when the server answers with a refusal: that is not being offline', async () => {
    const fake = createFakeSupabase()
    fake.fail('categories', '42501')
    renderScreen(<Shell />, fake)

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText(LINE)).toBeNull()
  })

  it('shows when the phone says it has no network, and goes when it is back', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    render(<OfflineBanner />)
    expect(screen.queryByText(LINE)).toBeNull()

    onLine.mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('status').textContent).toBe(LINE)

    onLine.mockReturnValue(true)
    act(() => void window.dispatchEvent(new Event('online')))
    expect(screen.queryByText(LINE)).toBeNull()
  })

  it('is told by the app’s own client, not only the test’s', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    const client = createSupabase({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'x'.repeat(24) })
    render(<OfflineBanner />)

    // Stopped once seen, so the client's retries do not outlive the test.
    const stop = new AbortController()
    // A query is sent when it is awaited, so it is started here and awaited once stopped.
    const failing = client.from('categories').select('id').abortSignal(stop.signal).then((reply) => reply)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(LINE))
    stop.abort()
    await act(async () => void (await failing))

    vi.stubGlobal('fetch', () => Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })))
    await act(async () => void (await client.from('categories').select('id')))
    expect(screen.queryByText(LINE)).toBeNull()
  })

  it('says nothing of an aborted request', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new DOMException('stopped', 'AbortError')))
    const client = createSupabase({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'x'.repeat(24) })
    render(<OfflineBanner />)

    await act(async () => void (await client.from('categories').select('id')))
    expect(screen.queryByText(LINE)).toBeNull()
  })
})
