import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDataProvider } from '../src/app-data.js'
import { useDebts, type DebtsState } from '../src/debts.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

// Hand-derived. Loan: $300.00 at 1% a month, $100.00 a month from July:
// 20,000, then 10,200, then in September 10,302 less 10,000 is 302; October
// pays 305 with its $0.03 of interest (D24). Car: $50.00 at 0%, $25.00 a
// month from September, plus a $25.00 extra that month: paid off at once.
function seeded(): FakeSupabase {
  return createFakeSupabase({
    debts: [
      { id: 'car', name: 'Car', starting_balance_cents: 5_000, minimum_payment_cents: 2_500, apr_basis_points: 0, start_date: '2026-09-01', sort_order: 1 },
      { id: 'loan', name: 'Loan', starting_balance_cents: 30_000, minimum_payment_cents: 10_000, apr_basis_points: 1_200, start_date: '2026-07-01', sort_order: 0 },
    ],
    debt_extra_payments: [{ id: 'x1', debt_id: 'car', month: '2026-09-01', amount_cents: 2_500 }],
  })
}

function renderDebts(fake: FakeSupabase) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com">
      {children}
    </AppDataProvider>
  )
  return renderHook(() => useDebts(), { wrapper })
}

const ready = (state: DebtsState) => {
  if (state.status !== 'ready') throw new Error(`not ready: ${state.status}`)
  return state.debts
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useDebts', () => {
  it('reads the debts and their extras, and hands them to core as of today', async () => {
    const { result } = renderDebts(seeded())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const d = ready(result.current)
    expect(d.asOf).toBe('2026-09-23')
    expect(d.status?.debts.map((x) => [x.name, x.month, x.balanceCents])).toEqual([
      ['Loan', 3, 302],
      ['Car', 1, 0],
    ])
    // 34,698 paid of 35,000: 9,913.7 bp.
    expect(d.status?.totals).toMatchObject({ balanceCents: 302, paymentCents: 15_000, progressBp: 9_914 })
    expect(d.plan.amortization?.debtFreeDate).toBe('2026-10-01')
    expect(d.strategies?.flat?.debtFreeDate).toBe('2026-10-01')
  })

  it('has no status and no plans with no debts', async () => {
    const { result } = renderDebts(createFakeSupabase())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(ready(result.current)).toMatchObject({ rows: [], status: null, strategies: null })
  })

  it('says why, when the extras cannot be read', async () => {
    const fake = seeded()
    fake.fail('debt_extra_payments', 'PGRST205')
    const { result } = renderDebts(fake)
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current).toMatchObject({ message: expect.stringContaining('(0014 in the setup guide)') })
  })
})
