import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerScreen } from '../src/screens/LedgerScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-23T12:00:00'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('LedgerScreen', () => {
  it('is headed with the name More gives it, and says its totals count every row', async () => {
    const fake = createFakeSupabase({
      categories: [
        { id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
        { id: 'c2', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
      ],
      transactions: [
        { id: 't1', posted_on: '2026-09-02', amount_cents: -4210, merchant_raw: 'CORNER MARKET', category_id: 'c1', source: 'card_pdf' },
        { id: 't2', posted_on: '2026-09-03', amount_cents: 20000, merchant_raw: 'PAYMENT, THANK YOU', category_id: 'c2', source: 'card_pdf' },
      ],
    })
    renderScreen(<LedgerScreen />, fake)

    expect(await screen.findByRole('heading', { level: 1, name: 'All transactions' })).toBeTruthy()
    await screen.findByText('CORNER MARKET')
    // A card payment is money in here, and never on the Month, so the
    // totals say what they add, lest they read as the Month's Spent.
    expect(screen.getByText(/Every row as it is, card payments and savings moves included/)).toBeTruthy()
  })
})
