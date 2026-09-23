import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import type { BudgetRow, Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, kind: Category['kind']): Category => ({
  id, name, kind, sort_order: 0, weekly_budget_cents: null,
})
const typed = (id: string, month: string, applies: BudgetRow['applies'], budget_cents: number): BudgetRow => ({
  id, category_id: 'groceries', month, applies, budget_cents,
})

/** Groceries with $100.00 spent in September; any budgets typed before the test. */
function seeded(...budgets: BudgetRow[]): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('groceries', 'Groceries', 'variable'), cat('pay', 'Pay', 'income')],
    transactions: [
      { id: 't1', posted_on: '2026-09-02', amount_cents: -10000, merchant_raw: 'SYNTHETIC MARKET', category_id: 'groceries', source: 'card_pdf' },
    ],
    category_budgets: budgets,
  })
}

const variable = () => within(screen.getByRole('region', { name: 'Variable expenses' }))
const groceries = () =>
  within(variable().getByRole('rowheader', { name: 'Groceries' }).closest('tr')!).getAllByRole('cell').map((c) => c.textContent)
const stored = (fake: FakeSupabase) => fake.tables.category_budgets.map((b) => [b.month, b.applies, b.budget_cents])

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

  it('saves "just this month" beside the budget carried in', async () => {
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
  })
})
