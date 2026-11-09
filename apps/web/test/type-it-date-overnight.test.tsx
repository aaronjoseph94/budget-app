import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Add → Type it fills its Date with today once, when the tab
 * is first drawn (AddScreen.tsx: useState(todayIso())), and never again. An
 * installed app is suspended with its page loaded and woken the next
 * morning (app-data.tsx says so, and moves `today` on for every screen that
 * reads it). Left on Type it overnight, the form still offers yesterday,
 * untouched by the owner, and a coffee typed this morning is saved under
 * yesterday. Over a month's end that is the wrong month: left open on
 * 30 September, woken on 1 October, the entry counts in September.
 */
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const food: Category = { id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Type it, left open overnight', () => {
  it('offers the new day, not the day the tab was opened, when the owner never chose a date', async () => {
    vi.setSystemTime(new Date(2026, 8, 30, 23, 30))
    const fake = createFakeSupabase({ categories: [food] })
    fake.rpcReplies.add_typed_transaction = null
    renderScreen(<AddScreen />, fake)
    fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
    const date = () => screen.getByLabelText<HTMLInputElement>('Date')
    expect(date().value).toBe('2026-09-30')

    // The phone sleeps; the app is woken at 8 the next morning, as app-data-wake.test.tsx wakes it.
    vi.setSystemTime(new Date(2026, 9, 1, 8, 0))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await pause(100)
    })
    // The app knows the day moved on: the field's own latest-allowed day is today's.
    expect(date().max).toBe('2026-10-01')

    // This morning's coffee, typed without touching the date.
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '4.50' } })
    fireEvent.change(screen.getByLabelText('What was it?'), { target: { value: 'Coffee cart' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'food' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(fake.rpcCalls.filter((c) => c.name === 'add_typed_transaction')).toHaveLength(1))

    const sent = fake.rpcCalls.find((c) => c.name === 'add_typed_transaction')
    expect(sent?.args.p_posted_on).toBe('2026-10-01')
  })
})
