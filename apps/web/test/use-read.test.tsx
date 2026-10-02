import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { AppDataProvider, useAppData } from '../src/app-data.js'
import { ReadRefused } from '../src/ledger.js'
import { useRead } from '../src/lib/use-read.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * The one way a screen reads its rows (architecture-b-06): the latest
 * answer for one key, dropped when stale, kept while the same key is read
 * again, re-read when the shared data changes, and retried on demand.
 */
afterEach(cleanup)

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

function setUp() {
  const fake = createFakeSupabase()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com">{children}</AppDataProvider>
  )
  return { wrapper }
}

describe('useRead', () => {
  it('drops an answer for a key no longer asked about', async () => {
    const calls: { key: string; d: ReturnType<typeof deferred<string>> }[] = []
    const { wrapper } = setUp()
    const { result, rerender } = renderHook(({ k }) => useRead(k, () => {
      const d = deferred<string>()
      calls.push({ key: k, d })
      return d.promise
    }), { wrapper, initialProps: { k: 'sep' } })
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    rerender({ k: 'oct' })
    await waitFor(() => expect(calls.some((c) => c.key === 'oct')).toBe(true))
    await act(async () => {
      calls.find((c) => c.key === 'oct')!.d.resolve('october rows')
      calls.filter((c) => c.key === 'sep').forEach((c) => c.d.resolve('september rows'))
    })
    expect(result.current).toEqual({ status: 'ready', key: 'oct', value: 'october rows' })
  })

  it('keeps the rows on screen while the same key is read again after the shared data changes', async () => {
    let n = 0
    const pending: ReturnType<typeof deferred<string>>[] = []
    const { wrapper } = setUp()
    const { result } = renderHook(() => {
      const read = useRead('sep', () => {
        n += 1
        if (n === 1) return Promise.resolve('first')
        const d = deferred<string>()
        pending.push(d)
        return d.promise
      })
      return { read, data: useAppData() }
    }, { wrapper })
    await waitFor(() => expect(result.current.read).toEqual({ status: 'ready', key: 'sep', value: 'first' }))
    await act(async () => {
      await result.current.data.refresh()
    })
    await waitFor(() => expect(pending.length).toBe(1))
    expect(result.current.read).toEqual({ status: 'ready', key: 'sep', value: 'first' })
    await act(async () => pending[0]!.resolve('second'))
    expect(result.current.read).toEqual({ status: 'ready', key: 'sep', value: 'second' })
  })

  it('says a failure, whether it is a missing update, and reads again on retry', async () => {
    let fail = true
    const { wrapper } = setUp()
    const { result } = renderHook(() => useRead('sep', () => (fail ? Promise.reject(new ReadRefused('not yet', 'PGRST205')) : Promise.resolve('rows'))), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.status === 'failed' && result.current.missingUpdate).toBe(true)
    fail = false
    await act(async () => {
      if (result.current.status === 'failed') result.current.retry()
    })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', key: 'sep', value: 'rows' }))
  })

  it('reads nothing for no key', async () => {
    let n = 0
    const { wrapper } = setUp()
    const { result } = renderHook(() => useRead(null, () => ((n += 1), Promise.resolve('x'))), { wrapper })
    await act(() => new Promise((r) => setTimeout(r, 30)))
    expect([result.current.status, n]).toEqual(['loading', 0])
  })
})
