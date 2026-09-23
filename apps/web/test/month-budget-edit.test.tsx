import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import { useAddress } from '../src/nav.js'
import type { BudgetRow, Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, kind: Category['kind']): Category => ({
  id, name, kind, sort_order: 0, weekly_budget_cents: null,
})
// Under the signed-in user's id, as the database holds every row (RLS).
const typed = (id: string, month: string, applies: BudgetRow['applies'], budget_cents: number) => ({
  id, user_id: 'u1', category_id: 'groceries', month, applies, budget_cents,
})

/** Groceries with $100.00 spent in September, Restaurants $25.00; any budgets typed before the test. */
function seeded(...budgets: ReturnType<typeof typed>[]): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('groceries', 'Groceries', 'variable'), cat('dining', 'Restaurants', 'variable'), cat('pay', 'Pay', 'income')],
    transactions: [
      { id: 't1', posted_on: '2026-09-02', amount_cents: -10000, merchant_raw: 'SYNTHETIC MARKET', category_id: 'groceries', source: 'card_pdf' },
      { id: 't2', posted_on: '2026-09-03', amount_cents: -2500, merchant_raw: 'SYNTHETIC GRILL', category_id: 'dining', source: 'card_pdf' },
    ],
    category_budgets: budgets,
  })
}

const variable = () => within(screen.getByRole('region', { name: 'Variable expenses' }))
const groceries = () =>
  within(variable().getByRole('rowheader', { name: 'Groceries' }).closest('tr')!).getAllByRole('cell').map((c) => c.textContent)
const stored = (fake: FakeSupabase) => fake.tables.category_budgets.map((b) => [b.month, b.applies, b.budget_cents])

/** A save that is refused (42501), and answers only when told to. */
function refusedLate(fake: FakeSupabase): () => void {
  fake.fail('POST category_budgets', '42501')
  let answer = (): void => undefined
  const answered = new Promise<void>((resolve) => {
    answer = resolve
  })
  fake.server.hold = (target) => (target === 'POST category_budgets' ? answered : null)
  return () => answer()
}

function Routed() {
  return <MonthScreen month={useAddress().month} />
}

async function edit(fake: FakeSupabase, month = '2026-09') {
  renderScreen(<MonthScreen month={month} />, fake)
  fireEvent.click(await screen.findByRole('button', { name: /^Budget for Groceries, / }))
  return screen.getByRole<HTMLInputElement>('textbox', { name: /^Budget for Groceries in / })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('Typing a budget on the Month', () => {
  it('saves "from this month on" by default, re-reads the month, and says what it did', async () => {
    const fake = seeded()
    const field = await edit(fake)
    // Its own tap: the charges sheet does not open.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'From this month on' }).checked).toBe(true)

    fireEvent.change(field, { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await variable().findByRole('status')).textContent).toBe('Groceries: $250.00 from September on.')
    expect(fake.tables.category_budgets).toMatchObject([
      { user_id: 'u1', category_id: 'groceries', month: '2026-09-01', applies: 'onward', budget_cents: 25000 },
    ])
    // Core's figures, from the month read again: 250.00 − 100.00.
    await waitFor(() => expect(groceries()).toEqual(['250.00', '100.00', '150.00']))
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('saves "just this month" beside the budget carried in, which later months keep', async () => {
    const fake = seeded(typed('b1', '2026-08-01', 'onward', 20000))
    const field = await edit(fake)
    expect(field.value).toBe('200.00')

    fireEvent.click(screen.getByRole('radio', { name: 'Just this month' }))
    fireEvent.change(field, { target: { value: '$1,250.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await variable().findByRole('status')).textContent).toBe('Groceries: $1,250.50 in September only.')
    expect(stored(fake)).toEqual([
      ['2026-08-01', 'onward', 20000],
      ['2026-09-01', 'only', 125050],
    ])
    await waitFor(() => expect(groceries()).toEqual(['1,250.50', '100.00', '1,150.50']))
    cleanup()

    renderScreen(<MonthScreen month="2026-10" />, fake)
    expect(await screen.findByRole('button', { name: 'Budget for Groceries, $200.00' })).toBeTruthy()
  })

  it('refuses what is not an amount, or is below zero, in words, and saves nothing', async () => {
    const fake = seeded()
    const field = await edit(fake)

    for (const [text, said] of [
      ['lots', 'Type the budget as an amount, like 250 or 250.00.'],
      ['', 'Type the budget as an amount, like 250 or 250.00.'],
      ['12.345', 'Type the budget as an amount, like 250 or 250.00.'],
      ['-5', 'A budget cannot be below zero.'],
    ] as const) {
      fireEvent.change(field, { target: { value: text } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(within(screen.getByRole('alert')).getByText(said)).toBeTruthy()
    }
    expect(fake.tables.category_budgets).toEqual([])
  })

  it('says why in words when the database refuses, and keeps what was typed', async () => {
    const fake = seeded()
    fake.fail('POST category_budgets', '23503')
    const field = await edit(fake)
    fireEvent.change(field, { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'That category is no longer there — it may have been removed on another device. Nothing was saved. (code 23503)',
    )
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Budget for Groceries in September' }).value).toBe('250')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false)
  })

  // Hand-derived: no budget, so Left is 0 − 100.00 (F5); "just this month"
  // clears September alone.
  it('clears to a typed "no budget", for the months chosen, never $0', async () => {
    const fake = seeded(typed('b1', '2026-07-01', 'onward', 20000))
    await edit(fake)
    fireEvent.click(screen.getByRole('button', { name: 'Clear budget' }))

    expect((await variable().findByRole('status')).textContent).toBe('Groceries: no budget from September on.')
    expect(stored(fake)).toEqual([
      ['2026-07-01', 'onward', 20000],
      ['2026-09-01', 'onward', null],
    ])
    await waitFor(() => expect(groceries()).toEqual(['', '100.00', '-100.00']))
    cleanup()

    const again = seeded(typed('b1', '2026-07-01', 'onward', 20000))
    await edit(again)
    fireEvent.click(screen.getByRole('radio', { name: 'Just this month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear budget' }))
    await waitFor(() => expect(stored(again)).toEqual([
      ['2026-07-01', 'onward', 20000],
      ['2026-09-01', 'only', null],
    ]))
  })

  it('replaces the month\'s own "just this month" value too, so September shows what was typed', async () => {
    const fake = seeded(typed('b1', '2026-07-01', 'onward', 20000), typed('b2', '2026-09-01', 'only', 5000))
    const field = await edit(fake)
    expect(field.value).toBe('50.00')
    fireEvent.change(field, { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(groceries()).toEqual(['80.00', '100.00', '-20.00']))
    expect(stored(fake)).toEqual([
      ['2026-07-01', 'onward', 20000],
      ['2026-09-01', 'only', 8000],
      ['2026-09-01', 'onward', 8000],
    ])
  })

  // Hand-derived: September's "from this month on" 200.00 typed over with
  // 80.00, so Left is 80.00 − 100.00.
  it('replaces no other "just this month" value: not August\'s, and none September lacks', async () => {
    const fake = seeded(typed('b1', '2026-08-01', 'only', 5000), typed('b2', '2026-09-01', 'onward', 20000))
    const field = await edit(fake)
    fireEvent.change(field, { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(groceries()).toEqual(['80.00', '100.00', '-20.00']))
    expect(stored(fake)).toEqual([
      ['2026-08-01', 'only', 5000],
      ['2026-09-01', 'onward', 8000],
    ])
    // Opening the editor again clears what the last save said.
    fireEvent.click(variable().getByRole('button', { name: 'Budget for Groceries, $80.00' }))
    expect(variable().queryByRole('status')).toBeNull()
  })

  it('calls it a goal on Income, offers no clearing with none set, and closes on Escape', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 empty' }))
    fireEvent.click(screen.getByRole('button', { name: 'Goal for Pay, none set' }))
    const field = screen.getByRole('textbox', { name: 'Goal for Pay in September' })
    expect(screen.queryByRole('button', { name: /^Clear/ })).toBeNull()

    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('closes only its own editor when a save answers after another row was opened', async () => {
    const fake = seeded()
    let answer = (): void => undefined
    const answered = new Promise<void>((resolve) => {
      answer = resolve
    })
    fake.server.hold = (target) => (target === 'POST category_budgets' ? answered : null)
    const field = await edit(fake)
    fireEvent.change(field, { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fake.tables.category_budgets).toHaveLength(1))

    fireEvent.click(variable().getByRole('button', { name: 'Budget for Restaurants, none set' }))
    answer()

    expect((await variable().findByRole('status')).textContent).toBe('Groceries: $250.00 from September on.')
    expect(screen.getByRole('textbox', { name: 'Budget for Restaurants in September' })).toBeTruthy()
  })

  it('says so on the Month when a save is refused after its editor closed, until another opens', async () => {
    const lost =
      'A budget or goal was not saved' +
      'Groceries, September: Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)'
    // Another row opened while it saved.
    const fake = seeded()
    const answer = refusedLate(fake)
    fireEvent.change(await edit(fake), { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(variable().getByRole('button', { name: 'Budget for Restaurants, none set' }))
    answer()
    expect((await screen.findByRole('alert')).textContent).toBe(lost)
    expect(variable().queryByRole('status')).toBeNull()
    expect(fake.tables.category_budgets).toEqual([])
    fireEvent.click(variable().getByRole('button', { name: 'Budget for Groceries, none set' }))
    expect(screen.queryByRole('alert')).toBeNull()
    cleanup()

    // Another month opened while it saved.
    const moved = seeded()
    const answerMoved = refusedLate(moved)
    window.location.hash = '/month/2026-09'
    renderScreen(<Routed />, moved)
    fireEvent.click(await screen.findByRole('button', { name: 'Budget for Groceries, none set' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Budget for Groceries in September' }), { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    act(() => {
      window.location.hash = '/month/2026-10'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    answerMoved()
    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeTruthy()
    expect((await screen.findByRole('alert')).textContent).toBe(lost)
  })
})
