import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerScreen } from '../src/screens/LedgerScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

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
    await expectNoAxeViolations()
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

/**
 * Open the screen and wait until its rows are the ones it keeps: it reads
 * the month on mounting and again once the app's first load is in, and a
 * row found from the first read is gone for a moment while the second runs.
 */
async function open(fake: FakeSupabase) {
  let reads = 0
  fake.server.hold = (target) => {
    if (target === 'transactions') reads += 1
    return null
  }
  renderScreen(<LedgerScreen />, fake)
  await waitFor(() => expect(reads).toBe(2))
  await screen.findByText('CORNER MARKET')
  fake.server.hold = null
}

// The one place a ledger row is deleted, so what it removes is money
// records, and a refusal must never read as done (CR-6).
describe('LedgerScreen, removing a transaction', () => {
  it('asks once more, then removes only that row', async () => {
    const fake = seeded()
    await open(fake)

    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' }))
    expect(fake.tables.transactions).toHaveLength(3)
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('CORNER MARKET')).toBeNull())
    expect(fake.tables.transactions.map((t) => t.id)).toEqual(['t2', 't3'])
    expect(screen.getByText('LITWARE BOOKS')).toBeTruthy()
  })

  it('keeps the other rows on screen while the month is read again after a removal (FE-5)', async () => {
    const fake = seeded()
    await open(fake)
    let release: () => void = () => undefined
    const held = new Promise<void>((done) => (release = done))
    fake.server.hold = (target) => (target === 'transactions' ? held : null)

    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' }))
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(fake.tables.transactions).toHaveLength(2))
    await new Promise((r) => setTimeout(r, 20))

    expect(screen.getByText('LITWARE BOOKS')).toBeTruthy()
    expect(screen.queryByRole('status', { name: /Loading/ })).toBeNull()
    fake.server.hold = null
    release()
    await waitFor(() => expect(screen.queryByText('CORNER MARKET')).toBeNull())
  })

  it('says why when the removal is refused, and keeps the row', async () => {
    const fake = seeded()
    fake.fail('DELETE transactions', '42501')
    await open(fake)

    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' }))
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText('CORNER MARKET')).toBeTruthy()
    expect(fake.tables.transactions).toHaveLength(3)
  })
})

describe('LedgerScreen, finding a transaction', () => {
  it('steps back a month, and not past this one', async () => {
    await open(seeded())
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next month' }).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByText('AUGUST CAFE')).toBeTruthy()
    expect(screen.queryByText('CORNER MARKET')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByText('CORNER MARKET')).toBeTruthy()
  })

  it('narrows the month to a merchant or a category typed in the search', async () => {
    await open(seeded())
    const search = screen.getByRole('searchbox', { name: "Search this month's transactions" })

    fireEvent.change(search, { target: { value: 'litware' } })
    expect(screen.queryByText('CORNER MARKET')).toBeNull()
    expect(screen.getByText('LITWARE BOOKS')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'nothing like it' } })
    expect(screen.getByText('No matches')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'groceries' } })
    expect(screen.getByText('CORNER MARKET')).toBeTruthy()
  })
})

describe('LedgerScreen, in Mockup A (step 10)', () => {
  it("takes the Month's title and a ‹ Sep 2026 › stepper that names the month it shows", async () => {
    await open(seeded())
    expect(screen.getByRole('heading', { level: 1, name: 'All transactions' }).className).toContain('font-bold')
    const stepper = screen.getByRole('button', { name: 'Previous month' }).parentElement!
    expect(stepper.textContent).toBe('Sep 2026')
    fireEvent.click(within(stepper).getByRole('button', { name: 'Previous month' }))
    await screen.findByText('AUGUST CAFE')
    expect(stepper.textContent).toBe('Aug 2026')
  })
})

// How a row came in, where it was not a statement (0020's ai_app beside typed).
describe('LedgerScreen, where a row came from', () => {
  it('says added by hand or added by an AI app, and nothing on a statement row', async () => {
    const fake = seeded()
    fake.tables.transactions.push(
      { id: 't4', posted_on: '2026-09-06', amount_cents: -450, merchant_raw: 'Coffee with Sam', category_id: 'c1', source: 'typed' },
      { id: 't5', posted_on: '2026-09-07', amount_cents: -1250, merchant_raw: 'Lunch at Subway', category_id: 'c1', source: 'ai_app' },
    )
    await open(fake)

    expect(rowOf('Coffee with Sam').getByText('added by hand')).toBeTruthy()
    expect(rowOf('Lunch at Subway').getByText('added by an AI app')).toBeTruthy()
    expect(rowOf('CORNER MARKET').queryByText(/added by/)).toBeNull()
  })
})
