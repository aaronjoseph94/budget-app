import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, kind: Category['kind'], sort_order: number): Category => ({
  id, name, kind, sort_order, weekly_budget_cents: null,
})
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string, merchant_raw: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw, category_id, source: 'card_pdf',
})

// Synthetic shops. One is written as markup, to prove it is shown as text.
const MARKUP = '<img src=x onerror=alert(1)> FABRIKAM DELI'

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      cat('groceries', 'Groceries', 'variable', 0),
      cat('dining', 'Restaurants', 'variable', 1),
      cat('rent', 'Rent', 'bill', 0),
      cat('card', 'Card payments', 'transfer', 0),
    ],
    transactions: [
      tx('t1', '2026-09-02', -6412, 'groceries', 'CONTOSO MARKET'),
      tx('t2', '2026-09-20', -3588, 'groceries', MARKUP),
      tx('t3', '2026-09-12', -2500, 'dining', 'TAILSPIN GRILL'),
      tx('t9', '2026-08-31', -9999, 'groceries', 'NORTHWIND FOODS'),
    ],
  })
}

function openRow(block: string, name: string): ReturnType<typeof within> {
  fireEvent.click(within(screen.getByRole('region', { name: block })).getByRole('button', { name }))
  return within(screen.getByRole('dialog', { name }))
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

describe('Month row charges', () => {
  it("opens the category's charges for the month, newest first, with the engine's Actual", async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())
    await screen.findByRole('rowheader', { name: 'Groceries' })

    const sheet = openRow('Variable expenses', 'Groceries')
    expect(sheet.getByText(/Variable expenses · September 2026 ·/).textContent).toBe(
      'Variable expenses · September 2026 · $100.00',
    )
    const charges = sheet.getAllByRole('listitem').map((li: HTMLElement) => li.textContent)
    expect(charges).toEqual([`${MARKUP}20 Sep 2026-$35.88`, 'CONTOSO MARKET2 Sep 2026-$64.12'])
    // Another category's charge and August's are not in it.
    expect(sheet.queryByText('TAILSPIN GRILL')).toBeNull()
    expect(sheet.queryByText('NORTHWIND FOODS')).toBeNull()
  })

  it('shows a shop name written as markup as text, never as markup', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())
    await screen.findByRole('rowheader', { name: 'Groceries' })

    openRow('Variable expenses', 'Groceries')
    expect(screen.getByText(MARKUP)).toBeTruthy()
    expect(document.querySelector('[role="dialog"] img')).toBeNull()
  })

  it('opens from a tap anywhere on the row, and says so when nothing is filed there', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())
    const bills = within(await screen.findByRole('region', { name: 'Bills' }))
    fireEvent.click(bills.getByRole('button', { name: 'Show 1 empty' }))

    const row = bills.getByRole('rowheader', { name: 'Rent' }).closest('tr')
    if (row === null) throw new Error('no Rent row')
    fireEvent.click(row)
    const sheet = within(screen.getByRole('dialog', { name: 'Rent' }))
    expect(sheet.getByText('No charges filed here in September.')).toBeTruthy()
  })
})
