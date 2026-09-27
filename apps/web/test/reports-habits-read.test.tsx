import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDataProvider, useAppData } from '../src/app-data.js'
import { habitsOf, useHabitsRead } from '../src/reports/habits-read.js'
import type { FakeSupabase } from './fake-supabase.js'
import { habitsFake } from './habits-seed.js'

/** What the Habits read (plan A18), handed to core's four habits (F40); the seed's figures, worked by hand. */

function read(fake: FakeSupabase) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com">
      {children}
    </AppDataProvider>
  )
  return renderHook(() => ({ read: useHabitsRead('2026-09-24'), categories: useAppData().categories }), { wrapper })
}

afterEach(cleanup)

describe('useHabitsRead', () => {
  it('reads twelve months to today, and core finds the grid, the weekday, the streak and the best', async () => {
    const { result } = read(habitsFake())
    await waitFor(() => expect(result.current.read.status).toBe('ready'))
    const { read: done, categories } = result.current
    if (done.status !== 'ready') throw new Error(done.status)
    // 33 Saturdays, 7 Dining out days, 8 rents and a coffee.
    expect([done.rows.readFrom, done.rows.rows.length]).toEqual(['2025-09-01', 49])
    const habits = habitsOf(done.rows, categories)
    expect([habits.grid.weeks.length, habits.grid.allowance]).toEqual([26, { cents: 3_000, from: 'budgets' }])
    expect(habits.pattern).toMatchObject({ status: 'ready', weeks: 12, costliest: 6 })
    // Each month's Dining out week goes over; the five weeks since 12 August are kept.
    expect(habits.streaks).toMatchObject({ status: 'ready', current: 5, best: 5, bestEnded: '2026-09-14' })
    expect(habits.bests).toMatchObject({ status: 'ready', months: 7, bests: [{ categoryId: 'dining', cents: 25_000, nextCents: 28_000, nextMonth: '2026-04-01' }] })
  })

  it('says when a one-time update is missing, and when a read failed for another reason', async () => {
    const missing = habitsFake()
    missing.fail('transactions', '42P01')
    const first = read(missing)
    await waitFor(() => expect(first.result.current.read).toEqual({ status: 'failed', missingUpdate: true }))
    const lost = habitsFake()
    lost.fail('transactions', '08006')
    const second = read(lost)
    await waitFor(() => expect(second.result.current.read).toEqual({ status: 'failed', missingUpdate: false }))
  })
})
