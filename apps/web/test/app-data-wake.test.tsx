import { act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppData, type AppData } from '../src/app-data.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * An app left open overnight (architecture-c1-01). The phone suspends it
 * with the page still loaded, so the next morning it is woken, not opened:
 * today and the shared data must be read again then, or every screen shows
 * yesterday as today and figures from before the laptop's import.
 */
function Probe({ into }: { into: { current: AppData | null } }) {
  into.current = useAppData()
  return null
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
let visible = true

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  visible = true
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function opened() {
  vi.setSystemTime(new Date(2026, 8, 30, 23, 30))
  const fake = createFakeSupabase()
  const reads: string[] = []
  fake.server.hold = (target) => {
    reads.push(target)
    return null
  }
  const data: { current: AppData | null } = { current: null }
  renderScreen(<Probe into={data} />, fake)
  await act(() => pause(50))
  expect([data.current?.today, data.current?.version]).toEqual(['2026-09-30', 1])
  return { data, categoryReads: () => reads.filter((r) => r.includes('categories')).length }
}

async function wake(event: () => void) {
  await act(async () => {
    event()
    await pause(50)
  })
}

describe('AppData, woken the next morning', () => {
  it('reads today and the shared data again when the page is shown again', async () => {
    const { data, categoryReads } = await opened()
    vi.setSystemTime(new Date(2026, 9, 1, 8, 0))
    await wake(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(data.current?.today).toBe('2026-10-01')
    expect(data.current?.version).toBe(2)
    expect(categoryReads()).toBe(2)
  })

  it('reads again when the page comes back from the back-forward cache, or the network comes back', async () => {
    const { data } = await opened()
    vi.setSystemTime(new Date(2026, 9, 1, 8, 0))
    await wake(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    expect([data.current?.today, data.current?.version]).toEqual(['2026-10-01', 2])
    vi.setSystemTime(new Date(2026, 9, 1, 8, 5))
    await wake(() => window.dispatchEvent(new Event('online')))
    expect(data.current?.version).toBe(3)
  })

  it('does not read again for a first load or a switch back within half a minute on the same day', async () => {
    const { data, categoryReads } = await opened()
    vi.setSystemTime(new Date(2026, 8, 30, 23, 30, 20))
    await wake(() => document.dispatchEvent(new Event('visibilitychange')))
    vi.setSystemTime(new Date(2026, 8, 30, 23, 31))
    await wake(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })))
    visible = false
    vi.setSystemTime(new Date(2026, 8, 30, 23, 45))
    await wake(() => document.dispatchEvent(new Event('visibilitychange')))
    expect([data.current?.version, categoryReads()]).toEqual([1, 1])
  })

  it('reads again at once for a new day, or the network back, however recent the last read', async () => {
    const { data } = await opened()
    vi.setSystemTime(new Date(2026, 8, 30, 23, 30, 10))
    await wake(() => window.dispatchEvent(new Event('online')))
    expect(data.current?.version).toBe(2)
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59, 50))
    await wake(() => window.dispatchEvent(new Event('online')))
    vi.setSystemTime(new Date(2026, 9, 1, 0, 0, 5))
    await wake(() => document.dispatchEvent(new Event('visibilitychange')))
    expect([data.current?.today, data.current?.version]).toEqual(['2026-10-01', 4])
  })

  it('notices midnight while the page stays open', async () => {
    // The minute check is an interval, so this test fakes it too.
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    const { data } = await opened()
    vi.setSystemTime(new Date(2026, 9, 1, 0, 0, 30))
    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await pause(50)
    })
    expect([data.current?.today, data.current?.version]).toEqual(['2026-10-01', 2])
  })
})
