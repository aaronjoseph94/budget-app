import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerScreen } from '../src/screens/LedgerScreen.js'
import { useAddress } from '../src/nav.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-23T12:00:00'))
  // A month stepped is an address, and navigate() scrolls to the top: jsdom has no scrolling.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

/** The screen as the app draws it: its month from the address. */
function Routed() {
  return <LedgerScreen month={useAddress().param} />
}

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
    renderScreen(<Routed />, fake)

    expect(await screen.findByRole('heading', { level: 1, name: 'All transactions' })).toBeTruthy()
    await screen.findByText('CORNER MARKET')
    // A card payment is money in here, and never on the Month, so the
    // totals say what they add, lest they read as the Month's Spent.
    expect(screen.getByText(/Every row as it is, card payments and savings moves included/)).toBeTruthy()
    await expectNoAxeViolations()
  })

  // At 320 px each total had half the row, and "-$2,771.99" put its minus
  // sign on a line of its own. Each card is now never narrower than its
  // figure, and a row that cannot hold both puts one under the other.
  it('puts Money in under Money out, rather than break a total, when both do not fit', async () => {
    const fake = createFakeSupabase({
      categories: [{ id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }],
      transactions: [{ id: 't1', posted_on: '2026-09-02', amount_cents: -1234567, merchant_raw: 'CORNER MARKET', category_id: 'c1', source: 'card_pdf' }],
    })
    renderScreen(<Routed />, fake)
    const out = (await screen.findByText('Money out')).parentElement
    expect(out?.className.split(' ')).toEqual(expect.arrayContaining(['min-w-min', 'grow']))
    expect(out?.parentElement?.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'flex-wrap']))
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
 * the month once, when the app's first load is in. It used to read on
 * mounting too, and again after; the shared read waits for the first load
 * (architecture-b-06).
 */
async function open(fake: FakeSupabase) {
  let reads = 0
  fake.server.hold = (target) => {
    if (target === 'transactions') reads += 1
    return null
  }
  renderScreen(<Routed />, fake)
  await waitFor(() => expect(reads).toBe(1))
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

  // e2e-money-03: the trash button gave way to Remove, and Remove to
  // nothing, and focus fell to the page each time. Remove takes focus, and
  // after it the next row's trash button.
  it('moves focus to Remove, then to the next row', async () => {
    const fake = seeded()
    await open(fake)
    const trash = rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' })
    trash.focus()
    fireEvent.click(trash)
    expect(document.activeElement).toBe(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }))
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByText('CORNER MARKET')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(rowOf('LITWARE BOOKS').getByRole('button', { name: 'Remove this transaction' })))
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

  it('takes a removed row, and its amount, off at once while the app reads again', async () => {
    const fake = seeded()
    await open(fake)
    const moneyOut = () => screen.getByText('Money out').nextElementSibling?.textContent
    expect(moneyOut()).toContain('62.09')
    let release: () => void = () => undefined
    const held = new Promise<void>((done) => (release = done))
    // Every read waits, the app's own refresh and the month's: a slow phone.
    fake.server.hold = () => held

    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' }))
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(fake.tables.transactions).toHaveLength(2))

    // Gone, with no Remove left to press on a row already deleted.
    await waitFor(() => expect(screen.queryByText('CORNER MARKET')).toBeNull())
    expect(screen.getByText('LITWARE BOOKS')).toBeTruthy()
    expect(moneyOut()).toContain('19.99')
    fake.server.hold = null
    release()
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

describe('LedgerScreen, changing your mind about a removal', () => {
  it('puts the bin back on Escape, with the focus, and removes nothing', async () => {
    const fake = seeded()
    await open(fake)
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' }))
    fireEvent.keyDown(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }), { key: 'Escape' })

    expect(rowOf('CORNER MARKET').queryByRole('button', { name: 'Remove' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' })))
    expect(fake.tables.transactions).toHaveLength(3)
  })

  it('puts the bin back when focus leaves Remove', async () => {
    await open(seeded())
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' }))
    fireEvent.blur(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }))
    expect(rowOf('CORNER MARKET').queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('is not still armed after stepping to another month and back', async () => {
    await open(seeded())
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await screen.findByText('AUGUST CAFE')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    await screen.findByText('CORNER MARKET')
    expect(rowOf('CORNER MARKET').queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('does not carry a refused removal’s words to another month', async () => {
    const fake = seeded()
    fake.fail('DELETE transactions', '42501')
    await open(fake)
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove this transaction' }))
    fireEvent.click(rowOf('CORNER MARKET').getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Something went wrong')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await screen.findByText('AUGUST CAFE')
    expect(screen.queryByText('Something went wrong')).toBeNull()
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

  // Held in the screen alone, the month fell back to this one on a reload
  // or Back (bug bash, phone). It is in the address, as the Month's is, and
  // this month is the bare address.
  it('keeps the month it shows in the address, this month as the bare #/ledger', async () => {
    window.location.hash = '#/ledger'
    await open(seeded())
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByText('AUGUST CAFE')).toBeTruthy()
    expect(window.location.hash).toBe('#/ledger/2026-08')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByText('CORNER MARKET')).toBeTruthy()
    expect(window.location.hash).toBe('#/ledger')
  })

  it('opens on the month its address names', async () => {
    renderScreen(<LedgerScreen month="2026-08" />, seeded())
    expect(await screen.findByText('AUGUST CAFE')).toBeTruthy()
    expect(screen.getByText('August 2026')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next month' }).disabled).toBe(false)
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
    // At 320 px "added by hand" ran on past the category, over the amount:
    // the line wraps, and a long category name breaks anywhere in its pill.
    const line = rowOf('Coffee with Sam').getByText('added by hand').parentElement!
    expect(line.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'flex-wrap']))
    expect(rowOf('Coffee with Sam').getByText('Groceries').className.split(' ')).toContain('[overflow-wrap:anywhere]')
  })

  // Cut to one line, 27 of 44 names ended in "…" at 320 px, and a refund
  // read as the purchase under it: a phone has no way to read the rest.
  it('lets a shop name wrap to three lines, breaking anywhere, rather than cut it', async () => {
    await open(seeded())
    const name = rowOf('CORNER MARKET').getByText('CORNER MARKET').closest('p')!
    expect(name.className.split(' ')).toEqual(expect.arrayContaining(['line-clamp-3', '[overflow-wrap:anywhere]']))
    expect(name.className.split(' ')).not.toContain('truncate')
  })
})

// A row dated after this month (a statement read with day and month the
// wrong way round) could never be reached: Next month stopped at this
// month, so the row could not be found or removed.
describe('LedgerScreen, a row dated after this month', () => {
  it('steps forward to it, removes it, and stops where nothing is later', async () => {
    const fake = seeded()
    fake.tables.transactions.push({ id: 't9', posted_on: '2026-12-05', amount_cents: -2550, merchant_raw: 'GARDEN CENTRE', category_id: 'c1', source: 'card_csv' })
    await open(fake)
    expect(screen.queryByText('GARDEN CENTRE')).toBeNull()

    for (const month of ['Oct 2026', 'Nov 2026', 'Dec 2026']) {
      // Next month waits for the month's read to say whether a later month has rows.
      await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next month' }).disabled).toBe(false))
      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
      await screen.findByText(month)
    }
    await screen.findByText('GARDEN CENTRE')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next month' }).disabled).toBe(true)

    fireEvent.click(rowOf('GARDEN CENTRE').getByRole('button', { name: 'Remove this transaction' }))
    fireEvent.click(rowOf('GARDEN CENTRE').getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByText('GARDEN CENTRE')).toBeNull())
    expect(fake.tables.transactions.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('keeps Next month off in this month when nothing is dated later', async () => {
    await open(seeded())
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next month' }).disabled).toBe(true)
  })
})
