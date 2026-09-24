import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerScreen } from '../src/screens/LedgerScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
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

/** Two charges in September and one in August, all invented. */
function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [{ id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }],
    transactions: [
      { id: 't1', posted_on: '2026-09-02', amount_cents: -4210, merchant_raw: 'CORNER MARKET', category_id: 'c1', source: 'card_pdf' },
      { id: 't2', posted_on: '2026-09-05', amount_cents: -1999, merchant_raw: 'LITWARE BOOKS', category_id: 'c1', source: 'card_pdf' },
      { id: 't3', posted_on: '2026-08-20', amount_cents: -700, merchant_raw: 'AUGUST CAFE', category_id: 'c1', source: 'typed' },
    ],
  })
}

const rowOf = (merchant: string) => within(screen.getByText(merchant).closest('li') as HTMLElement)

// The one place a ledger row is deleted, so what it removes is money
// records, and a refusal must never read as done (CR-6).
describe('LedgerScreen, removing a transaction', () => {
  it('asks once more, then removes only that row', async () => {
    const fake = seeded()
    renderScreen(<LedgerScreen />, fake)
    await screen.findByText('CORNER MARKET')

    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' }))
    expect(fake.tables.transactions).toHaveLength(3)
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('CORNER MARKET')).toBeNull())
    expect(fake.tables.transactions.map((t) => t.id)).toEqual(['t2', 't3'])
    expect(screen.getByText('LITWARE BOOKS')).toBeTruthy()
  })

  it('says why when the removal is refused, and keeps the row', async () => {
    const fake = seeded()
    fake.fail('DELETE transactions', '42501')
    renderScreen(<LedgerScreen />, fake)
    await screen.findByText('CORNER MARKET')

    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' }))
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText('CORNER MARKET')).toBeTruthy()
    expect(fake.tables.transactions).toHaveLength(3)
  })
})

describe('LedgerScreen, finding a transaction', () => {
  it('steps back a month, and not past this one', async () => {
    renderScreen(<LedgerScreen />, seeded())
    await screen.findByText('CORNER MARKET')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next month' }).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByText('AUGUST CAFE')).toBeTruthy()
    expect(screen.queryByText('CORNER MARKET')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByText('CORNER MARKET')).toBeTruthy()
  })

  it('narrows the month to a merchant or a category typed in the search', async () => {
    renderScreen(<LedgerScreen />, seeded())
    await screen.findByText('CORNER MARKET')
    const search = screen.getByPlaceholderText('Search merchant or category')

    fireEvent.change(search, { target: { value: 'litware' } })
    expect(screen.queryByText('CORNER MARKET')).toBeNull()
    expect(screen.getByText('LITWARE BOOKS')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'nothing like it' } })
    expect(screen.getByText('No matches')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'groceries' } })
    expect(screen.getByText('CORNER MARKET')).toBeTruthy()
  })
})
