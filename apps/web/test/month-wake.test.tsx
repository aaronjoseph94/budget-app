import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDataProvider } from '../src/app-data.js'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * The Month on a phone left open (architecture-c1-01): woken the next
 * morning it showed last month as this one and none of the night's
 * imports, and a category added on the laptop refused whole months until
 * the app was force-quit. Invented shops.
 */
const cat = (id: string, name: string, sort_order: number): Category => ({ id, name, kind: 'variable', sort_order, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const shown = async () =>
  act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await pause(100)
  })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the Month, on an app left open', () => {
  it('moves to the new month, and reads the night’s charges, when woken the next morning', async () => {
    vi.setSystemTime(new Date(2026, 8, 30, 23, 30))
    const fake = createFakeSupabase({ categories: [cat('groceries', 'Groceries', 0)], transactions: [tx('t1', '2026-09-12', -6412, 'groceries')] })
    const reads: string[] = []
    fake.server.hold = (target) => {
      reads.push(target)
      return null
    }
    renderScreen(<MonthScreen month={null} />, fake)
    await screen.findByText('September 2026')
    await waitFor(() => expect(document.body.textContent).toContain('64.12'))
    await act(() => pause(100))
    const before = reads.filter((r) => r.includes('transactions')).length

    fake.tables.transactions.push(tx('t2', '2026-10-01', -9999, 'groceries'))
    vi.setSystemTime(new Date(2026, 9, 1, 8, 0))
    await shown()

    expect(await screen.findByText('October 2026')).toBeTruthy()
    expect(reads.filter((r) => r.includes('transactions')).length).toBeGreaterThan(before)
    await waitFor(() => expect(document.body.textContent).toContain('99.99'))
  })

  it('shows a month whose charge names a category added on another device, once the app is shown again', async () => {
    vi.setSystemTime(new Date(2026, 8, 23, 12))
    const fake = createFakeSupabase({
      categories: [cat('groceries', 'Groceries', 0)],
      transactions: [tx('t1', '2026-09-12', -6412, 'groceries'), tx('t0', '2026-08-12', -1000, 'groceries')],
    })
    const ui = (month: string) => (
      <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com">
        <MonthScreen month={month} />
      </AppDataProvider>
    )
    const { rerender } = render(ui('2026-09'))
    await waitFor(() => expect(document.body.textContent).toContain('64.12'))

    // On the laptop: a new category, and an August charge filed under it.
    fake.tables.categories.push(cat('pets', 'Pets', 1))
    fake.tables.transactions.push(tx('t9', '2026-08-20', -4500, 'pets'))
    vi.setSystemTime(new Date(2026, 8, 23, 12, 5))
    await shown()

    rerender(ui('2026-08'))
    await waitFor(() => expect(document.body.textContent).toContain('45.00'))
    expect(document.body.textContent).not.toContain('names a category that did not load')
  })

  it('offers Try again where the month cannot be shown, and shows it once the categories are read again', async () => {
    vi.setSystemTime(new Date(2026, 8, 23, 12))
    const fake = createFakeSupabase({
      categories: [cat('groceries', 'Groceries', 0)],
      transactions: [tx('t1', '2026-09-12', -6412, 'groceries'), tx('t0', '2026-08-12', -1000, 'groceries')],
    })
    const ui = (month: string) => (
      <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com">
        <MonthScreen month={month} />
      </AppDataProvider>
    )
    const { rerender } = render(ui('2026-09'))
    await waitFor(() => expect(document.body.textContent).toContain('64.12'))
    fake.tables.categories.push(cat('pets', 'Pets', 1))
    fake.tables.transactions.push(tx('t9', '2026-08-20', -4500, 'pets'))

    // No wake: the phone steps straight back to August.
    rerender(ui('2026-08'))
    await waitFor(() => expect(document.body.textContent).toContain('names a category that did not load'))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(document.body.textContent).toContain('45.00'))
  })
})
