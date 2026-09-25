import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDataProvider, useAppData } from '../src/app-data.js'
import { reportOf, useReportRead } from '../src/reports/read.js'
import type { FakeSupabase } from './fake-supabase.js'
import { reportFake } from './report-seed.js'

/** What a month's review reads (plan A15), handed to core's monthReport; the figures are F36's worked example. */

function read(fake: FakeSupabase, month: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com">
      {children}
    </AppDataProvider>
  )
  return renderHook(() => ({ read: useReportRead(month, '2026-09-24'), categories: useAppData().categories }), { wrapper })
}

afterEach(cleanup)

describe('useReportRead', () => {
  it('reads the month and the six before it, and core reviews them', async () => {
    const fake = reportFake()
    const { result } = read(fake, '2026-08-01')
    await waitFor(() => expect(result.current.read.status).toBe('ready'))
    const { read: done, categories } = result.current
    if (done.status !== 'ready') throw new Error(done.status)
    expect([done.rows.readFrom, done.rows.month, done.rows.rows.length]).toEqual(['2026-02-01', '2026-08-01', 28])
    const { report, historyStart } = reportOf(done.rows, categories)
    expect(historyStart).toBe('2026-02-01')
    if (!('totals' in report)) throw new Error(report.status)
    expect([report.status, report.totals.spentCents, report.usualMonths]).toEqual(['complete', 206_000, 6])
  })

  it('says when a one-time update is missing, and when a read failed for another reason', async () => {
    const missing = reportFake()
    missing.fail('category_plans', '42P01')
    const first = read(missing, '2026-08-01')
    await waitFor(() => expect(first.result.current.read).toEqual({ status: 'failed', missingUpdate: true }))
    const lost = reportFake()
    lost.fail('transactions', '08006')
    const second = read(lost, '2026-08-01')
    await waitFor(() => expect(second.result.current.read).toEqual({ status: 'failed', missingUpdate: false }))
  })
})
