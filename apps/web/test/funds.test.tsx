import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDataProvider } from '../src/app-data.js'
import { useFunds, type FundsState } from '../src/funds.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, kind: Category['kind'], sort_order: number): Category => ({
  id, name, kind, sort_order, weekly_budget_cents: null,
})

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('flight', 'Flight training', 'savings', 0), cat('travel', 'Travel', 'savings', 1)],
    savings_goals: [
      // Linked on the 10th; the one before 0013 on no fund.
      { id: 'g1', name: 'Flight', target_cents: 100_000, saved_cents: 10_000, target_date: null, unit_cost_cents: null, unit_label: null, category_id: 'flight', start_date: null, balance_as_of: '2026-09-10' },
      { id: 'g2', name: 'Old', target_cents: 50_000, saved_cents: 5_000, target_date: null, unit_cost_cents: null, unit_label: null },
    ],
    transactions: [
      { id: 't1', posted_on: '2026-09-10', amount_cents: -1_000, merchant_raw: 'TO SAVINGS', category_id: 'flight', source: 'typed' },
      { id: 't2', posted_on: '2026-09-11', amount_cents: -2_500, merchant_raw: 'TO SAVINGS', category_id: 'flight', source: 'typed' },
      { id: 't3', posted_on: '2026-09-24', amount_cents: -9_000, merchant_raw: 'TO SAVINGS', category_id: 'flight', source: 'typed' },
    ],
  })
}

function renderFunds(fake: FakeSupabase) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com">
      {children}
    </AppDataProvider>
  )
  return renderHook(() => useFunds(), { wrapper })
}

const ready = (state: FundsState) => {
  if (state.status !== 'ready') throw new Error(`not ready: ${state.status}`)
  return state
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useFunds', () => {
  it('reads each fund with the transfers after its typed day, up to today, and hands them to core', async () => {
    const { result } = renderFunds(seeded())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const state = ready(result.current)
    expect(state.asOf).toBe('2026-09-23')
    // 100.00 typed at the end of the 10th, +25.00 on the 11th; the 10th's and the 24th's are not counted.
    expect(state.funds.funds.map((f) => [f.name, f.figures?.balanceCents ?? null])).toEqual([
      ['Flight training', 12_500],
      ['Travel', null],
    ])
    expect(state.funds.unlinked.map((u) => u.goalId)).toEqual(['g2'])
    expect(state.goals.map((g) => g.id)).toEqual(['g1', 'g2'])
  })

  it('reads no ledger when no goal is on a fund', async () => {
    const fake = seeded()
    fake.tables.savings_goals.splice(0, 1)
    fake.fail('transactions', '42501')
    const { result } = renderFunds(fake)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(ready(result.current).funds.funds.every((f) => f.figures === null)).toBe(true)
  })

  it('says why, in words, when the read fails', async () => {
    const fake = seeded()
    fake.fail('transactions', '42501')
    const { result } = renderFunds(fake)
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current).toEqual({
      status: 'failed',
      message: 'Your savings funds could not be read, so they are not shown. Try again. (code 42501)',
      missingUpdate: false,
    })
  })

  it('says when the read met a one-time update not yet pasted, so a screen can point to Help', async () => {
    const fake = seeded()
    fake.server.lacks = { savings_goals: ['category_id', 'start_date', 'balance_as_of'] }
    const { result } = renderFunds(fake)
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current).toMatchObject({ missingUpdate: true, message: expect.stringMatching(/\(code 42703\)$/) })
  })

  it('says so when a goal on a fund has no typed day, which 0013 refuses', async () => {
    const fake = seeded()
    fake.tables.savings_goals[0] = { ...fake.tables.savings_goals[0]!, balance_as_of: null }
    const { result } = renderFunds(fake)
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current).toMatchObject({ message: expect.stringMatching(/^A savings goal could not be read as the app expects/) })
  })
})
