import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDataProvider, useAppData } from '../src/app-data.js'
import { shopsOf, useShopsRead } from '../src/reports/shops-read.js'
import type { FakeSupabase } from './fake-supabase.js'
import { shopsFake } from './shops-seed.js'

/** What the Shops tab reads (plan A17), handed to core's topShops, recurringCharges and unusualCharges (F38, F39, F41). */

function read(fake: FakeSupabase, month = '2026-09-01') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com">
      {children}
    </AppDataProvider>
  )
  return renderHook(() => ({ read: useShopsRead(month, '2026-09-24'), categories: useAppData().categories }), { wrapper })
}

afterEach(cleanup)

describe('useShopsRead', () => {
  it('reads the month and the two years before it, and core finds the shops, the regular charges and the flags', async () => {
    const { result } = read(shopsFake())
    await waitFor(() => expect(result.current.read.status).toBe('ready'))
    const { read: done, categories } = result.current
    if (done.status !== 'ready') throw new Error(done.status)
    expect([done.rows.readFrom, done.rows.rows.length]).toEqual(['2024-09-01', 26])
    const figures = shopsOf(done.rows, categories, [])!
    expect(figures.top.shops.map((s) => [s.shop, s.nowCents])).toEqual([
      ['FURNITURE CO', 45_000],
      ['CAFE', 25_500],
      ['GYM', 4_500],
      ['SPOTIFY', 1_299],
      ['COFFEE HOUSE', 900],
      ['TEA', 625],
      ['TEA ROOM', 625],
    ])
    expect(figures.series.map((s) => [s.shop, s.cadence, s.isNew])).toEqual([
      ['GYM', 'monthly', true],
      ['SPOTIFY', 'monthly', false],
    ])
    const { large, newShop, doubles, countedTwice } = figures.unusual
    expect([large.map((c) => c.id), newShop.map((c) => c.id), doubles.map((p) => p.second.id), countedTwice.map((p) => p.second.id)]).toEqual([
      ['big'],
      ['sofa'],
      ['k2'],
      ['t2'],
    ])
    // A shop marked not a subscription is never one.
    expect(shopsOf(done.rows, categories, ['SPOTIFY'])!.series.map((s) => s.shop)).toEqual(['GYM'])
  })

  it('sees a month that is over as it stood at its end', async () => {
    const { result } = read(shopsFake(), '2026-08-01')
    await waitFor(() => expect(result.current.read.status).toBe('ready'))
    const { read: done, categories } = result.current
    if (done.status !== 'ready') throw new Error(done.status)
    const figures = shopsOf(done.rows, categories, [])!
    expect(figures.top.now).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    // By 31 August SPOTIFY had charged the same four times, CAFE weekly, and GYM only twice.
    expect(figures.series.map((s) => [s.shop, s.cadence, s.priceChange])).toEqual([
      ['CAFE', 'weekly', null],
      ['SPOTIFY', 'monthly', null],
    ])
  })

  it('says when a one-time update is missing, and when a read failed for another reason', async () => {
    const missing = shopsFake()
    missing.fail('transactions', '42P01')
    const first = read(missing)
    await waitFor(() => expect(first.result.current.read).toEqual({ status: 'failed', missingUpdate: true }))
    const lost = shopsFake()
    lost.fail('transactions', '08006')
    const second = read(lost)
    await waitFor(() => expect(second.result.current.read).toEqual({ status: 'failed', missingUpdate: false }))
  })
})
