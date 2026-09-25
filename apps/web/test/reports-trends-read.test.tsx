import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDataProvider, useAppData } from '../src/app-data.js'
import { trendsOf, useTrendsRead } from '../src/reports/trends-read.js'
import type { FakeSupabase } from './fake-supabase.js'
import { trendsFake } from './trends-seed.js'

/** What the Trends read (plan A16), handed to core's monthlyTrend and categoryTrends; the figures are F37's worked example. */

function read(fake: FakeSupabase) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com">
      {children}
    </AppDataProvider>
  )
  return renderHook(() => ({ read: useTrendsRead('2026-09-24'), categories: useAppData().categories }), { wrapper })
}

afterEach(cleanup)

describe('useTrendsRead', () => {
  it('reads the twelve months before this one, and core draws six or twelve of them', async () => {
    const { result } = read(trendsFake())
    await waitFor(() => expect(result.current.read.status).toBe('ready'))
    const { read: done, categories } = result.current
    if (done.status !== 'ready') throw new Error(done.status)
    expect([done.rows.readFrom, done.rows.rows.length]).toEqual(['2025-09-01', 30])
    const six = trendsOf(done.rows, categories, 6)
    expect(six.totals.spent.points).toEqual([166_000, 169_200, 166_900, 171_100, 174_000, 176_300])
    expect(six.categories.map((c) => [c.categoryId, c.label.status])).toEqual([
      ['dining', 'rising'],
      ['books', 'falling'],
      ['coffee', 'no_trend'],
    ])
    // The months before the records are gaps, not $0.
    expect(trendsOf(done.rows, categories, 12).totals.spent.points.slice(5, 7)).toEqual([null, 166_000])
  })

  it('says when a one-time update is missing, and when a read failed for another reason', async () => {
    const missing = trendsFake()
    missing.fail('category_plans', '42P01')
    const first = read(missing)
    await waitFor(() => expect(first.result.current.read).toEqual({ status: 'failed', missingUpdate: true }))
    const lost = trendsFake()
    lost.fail('transactions', '08006')
    const second = read(lost)
    await waitFor(() => expect(second.result.current.read).toEqual({ status: 'failed', missingUpdate: false }))
  })
})
