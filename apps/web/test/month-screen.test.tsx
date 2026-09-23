import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, kind: Category['kind'], sort_order: number): Category => ({
  id, name, kind, sort_order, weekly_budget_cents: null,
})
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      cat('groceries', 'Groceries', 'variable', 0),
      cat('dining', '<b>Dinner & drinks</b>', 'variable', 1),
      cat('clothing', 'Clothing', 'variable', 2),
      cat('gifts', 'Gifts', 'variable', 3),
      cat('rent', 'Rent', 'bill', 0),
      cat('phone', 'Phone', 'bill', 1),
      cat('music', 'Music', 'subscription', 0),
      cat('pay', 'Pay', 'income', 0),
      cat('fund', 'Flight fund', 'savings', 0),
      cat('card', 'Card payments', 'transfer', 0),
    ],
    transactions: [
      tx('t1', '2026-09-01', -6412, 'groceries'),
      tx('t2', '2026-09-30', -3588, 'groceries'),
      tx('t3', '2026-09-12', -2500, 'dining'),
      // A return with no purchase this month: below zero, minus sign kept (D8).
      tx('t4', '2026-09-14', 4000, 'clothing'),
      tx('t5', '2026-09-05', -5500, 'phone'),
      tx('t6', '2026-09-15', 250000, 'pay'),
      tx('t7', '2026-09-16', -30000, 'fund'),
      tx('t8', '2026-09-18', 50000, 'card'),
      // August: never in September's totals.
      tx('t9', '2026-08-31', -9999, 'groceries'),
    ],
  })
}

function block(name: string): ReturnType<typeof within> {
  return within(screen.getByRole('region', { name }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('MonthScreen blocks', () => {
  // Hand-derived. Variable: groceries 64.12 + 35.88 = 100.00, dining 25.00,
  // clothing −40.00: 85.00. Bills: phone 55.00. Income 2,500.00, savings 300.00.
  it("fills Workbook's blocks from the month's rows, phone order first", async () => {
    renderScreen(<MonthScreen month={null} />, seeded())

    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
    const order = (await screen.findAllByRole('region')).map((r) => r.getAttribute('aria-label'))
    expect(order).toEqual(['Variable expenses', 'Bills', 'Subscriptions', 'Debts', 'Income', 'Savings'])

    const variable = block('Variable expenses')
    expect(variable.getByText('$85.00')).toBeTruthy()
    expect(variable.getByRole('rowheader', { name: 'Groceries' }).closest('tr')?.textContent).toBe('Groceries$100.00')
    expect(block('Bills').getByText('$55.00', { selector: 'td' })).toBeTruthy()
    expect(block('Income').getByText('$2,500.00', { selector: 'td' })).toBeTruthy()
    expect(block('Savings').getByText('$300.00', { selector: 'td' })).toBeTruthy()
    // The card payment is in no block.
    expect(screen.queryByText('Card payments')).toBeNull()
  })

  it('shows a return with its minus sign, and a category name as text, never markup', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())

    const clothing = (await screen.findByRole('rowheader', { name: 'Clothing' })).closest('tr')
    expect(clothing?.textContent).toBe('Clothing-$40.00')
    expect(await screen.findByText('<b>Dinner & drinks</b>')).toBeTruthy()
    expect(document.querySelector('section b')).toBeNull()
  })

  it('folds rows with nothing this month behind "Show N empty"', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())

    await screen.findByRole('region', { name: 'Bills' })
    expect(screen.queryByRole('rowheader', { name: 'Gifts' })).toBeNull()
    expect(screen.queryByRole('rowheader', { name: 'Rent' })).toBeNull()

    fireEvent.click(block('Bills').getByRole('button', { name: 'Show 1 empty' }))
    expect(block('Bills').getByRole('rowheader', { name: 'Rent' }).closest('tr')?.textContent).toBe('Rent')
    fireEvent.click(block('Bills').getByRole('button', { name: 'Hide empty' }))
    expect(screen.queryByRole('rowheader', { name: 'Rent' })).toBeNull()
    // A list with nothing on it at all points to Setup instead.
    fireEvent.click(block('Debts').getByRole('button', { name: 'Add one in Setup' }))
    expect(window.location.hash).toBe('#/setup')
  })

  it("shows another month's rows only under that month's title", async () => {
    renderScreen(<MonthScreen month="2026-08" />, seeded())

    expect(await screen.findByRole('heading', { name: 'August 2026' })).toBeTruthy()
    expect(await block('Variable expenses').findByRole('rowheader', { name: 'Groceries' })).toBeTruthy()
    expect(block('Variable expenses').getByText('$99.99', { selector: 'td' })).toBeTruthy()
    expect(screen.queryByRole('rowheader', { name: 'Clothing' })).toBeNull()
  })

  it('says so, rather than leave a charge out, when its category did not load', async () => {
    const fake = seeded()
    fake.tables.transactions.push(tx('t10', '2026-09-20', -700, 'gone'))
    renderScreen(<MonthScreen month="2026-09" />, fake)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Could not show this month')).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('shows a readable message when the month cannot be loaded', async () => {
    const fake = seeded()
    fake.fail('transactions', '42501')
    renderScreen(<MonthScreen month="2026-09" />, fake)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Could not load this month')).toBeTruthy()
  })
})
