import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeekScreen } from '../src/screens/WeekScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 11 March 2026, local noon: the week is Monday 9 to Sunday 15.
// Only Date is faked, so promises and the waits in findBy* run normally.
const TODAY = new Date(2026, 2, 11, 12)

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      { id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 15000 },
      { id: 'c2', name: 'Eating out', kind: 'variable', sort_order: 0, weekly_budget_cents: 6000 },
    ],
    transactions: [
      { id: 't1', posted_on: '2026-03-09', amount_cents: -6412, merchant_raw: 'CORNER MARKET', category_id: 'c1', source: 'card_pdf' },
      { id: 't2', posted_on: '2026-03-10', amount_cents: -1845, merchant_raw: 'NORTHWIND DINER', category_id: 'c2', source: 'card_pdf' },
      { id: 't3', posted_on: '2026-03-11', amount_cents: -4755, merchant_raw: 'FABRIKAM PIZZA', category_id: 'c2', source: 'typed' },
      // The Sunday before: in last week, so never in this week's totals.
      { id: 't4', posted_on: '2026-03-08', amount_cents: -9999, merchant_raw: 'CONTOSO FUEL', category_id: 'c1', source: 'card_pdf' },
    ],
    ingest_candidates: [
      { id: 'p1', posted_on: '2026-03-10', amount_cents: -1349, merchant: 'LITWARE COFFEE', merchant_raw: 'LITWARE COFFEE', status: 'pending' },
      { id: 'p2', posted_on: '2026-03-10', amount_cents: -8900, merchant: 'ADVENTURE WORKS', merchant_raw: 'ADVENTURE WORKS', status: 'pending' },
    ],
  })
}

/** The list item that names a category, so its figures are read from its own row. */
async function categoryRow(name: string): Promise<HTMLElement> {
  const item = (await screen.findByText(name)).closest('li')
  if (!(item instanceof HTMLElement)) throw new Error(`no list item for ${name}`)
  return item
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('WeekScreen', () => {
  // Hand-derived: spent 64.12 + 18.45 + 47.55 = 130.12; budgets 150 + 60 = 210,
  // so 79.88 left. Eating out is 66.00 against 60.00. The Sunday before is out.
  it("shows this week's spending against its budgets, by category", async () => {
    renderScreen(<WeekScreen />, seeded())

    expect(await screen.findByText('$130.12')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'This week' })).toBeTruthy()
    expect(screen.getByText('$79.88')).toBeTruthy()
    expect(screen.getByText('left of $210.00 budgeted')).toBeTruthy()

    const groceries = within(await categoryRow('Groceries'))
    expect(groceries.getByText('$64.12')).toBeTruthy()
    expect(groceries.getByText('/ $150.00')).toBeTruthy()
    const eatingOut = within(await categoryRow('Eating out'))
    expect(eatingOut.getByText('$66.00')).toBeTruthy()
    expect(eatingOut.getByText('/ $60.00')).toBeTruthy()
  })

  it('says how many wait for review, and the banner opens Review', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    renderScreen(<WeekScreen />, seeded())

    const banner = await screen.findByRole('button', { name: /2 waiting for review/ })
    fireEvent.click(banner)
    expect(window.location.hash).toBe('#/review')
  })

  it('steps back a week and counts only that week', async () => {
    renderScreen(<WeekScreen />, seeded())
    await screen.findByText('$130.12')

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))

    expect(await screen.findByRole('heading', { name: 'Week of' })).toBeTruthy()
    // Once as the week's total, once on the Groceries row.
    expect(await screen.findAllByText('$99.99')).toHaveLength(2)
    expect(screen.queryByText('$130.12')).toBeNull()
  })

  // Hand-derived: budgets 10.00 + 60.00 = 70.00 against 130.12 spent, 60.12 over.
  it('says by how much the week is over budget, and steps forward again', async () => {
    const fake = seeded()
    fake.tables.categories[0] = { id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 1000 }
    renderScreen(<WeekScreen />, fake)

    expect(await screen.findByText('$60.12 over')).toBeTruthy()
    expect(screen.getByText('a $70.00 budget')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next week' })).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await screen.findByRole('heading', { name: 'Week of' })
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(await screen.findByRole('heading', { name: 'This week' })).toBeTruthy()
  })

  // Hand-derived: 8,450 of 30,000 is 28% with 21,550 to go; 21,550 over the
  // two weeks to 25 March is 10,775 a week; 130.12 at 275.00 an hour is 28 min.
  it('shows the goal, what it needs each week, and the week as goal time', async () => {
    const fake = seeded()
    fake.tables.savings_goals.push({
      id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 845_000,
      target_date: '2026-03-25', unit_cost_cents: 27_500, unit_label: 'flight time',
    })
    renderScreen(<WeekScreen />, fake)

    expect(await screen.findByText('Flight training')).toBeTruthy()
    expect(screen.getByText('28%')).toBeTruthy()
    expect(screen.getByText('$8,450.00')).toBeTruthy()
    expect(screen.getByText('of $30,000.00 · $21,550.00 to go')).toBeTruthy()
    expect(screen.getByText('$10,775.00')).toBeTruthy()
    expect(await screen.findByText('28 min')).toBeTruthy()
  })

  it('without budgets, shows the spend, the money in, and a way to set one', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const fake = seeded()
    fake.tables.categories = fake.tables.categories.map((c) => ({ ...c, weekly_budget_cents: null }))
    // In a category of its own, so it nets positive: money in, not a refund.
    fake.tables.categories.push({ id: 'c3', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push({ id: 't5', posted_on: '2026-03-12', amount_cents: 2500, merchant_raw: 'PAYROLL', category_id: 'c3', source: 'typed' })
    renderScreen(<WeekScreen />, fake)

    expect(await screen.findByText('$130.12')).toBeTruthy()
    expect(screen.getByText(/No weekly budgets set yet\./)).toBeTruthy()
    expect(screen.getByText('$25.00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Set one' }))
    expect(window.location.hash).toBe('#/settings')
  })

  // Hand-derived: the $500.00 card payment and the $200.00 move to savings
  // are in neither figure, so spent stays 130.12 and money in is the 25.00 pay.
  it('leaves a card payment and a savings move out of spending and money in, and says so', async () => {
    const fake = seeded()
    fake.tables.categories.push(
      { id: 'c3', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null },
      { id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null },
      { id: 'c5', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
    )
    fake.tables.transactions.push(
      { id: 't5', posted_on: '2026-03-12', amount_cents: 2500, merchant_raw: 'PAYROLL', category_id: 'c3', source: 'typed' },
      { id: 't6', posted_on: '2026-03-10', amount_cents: -20000, merchant_raw: 'TO SAVINGS', category_id: 'c4', source: 'typed' },
      { id: 't7', posted_on: '2026-03-11', amount_cents: 50000, merchant_raw: 'PAYMENT THANK YOU', category_id: 'c5', source: 'card_pdf' },
    )
    renderScreen(<WeekScreen />, fake)

    expect(await screen.findByText('$130.12')).toBeTruthy()
    expect(screen.getByText('$25.00')).toBeTruthy()
    expect(screen.getByText('$500.00').closest('p')?.textContent).toBe('Paid to your card: $500.00 — not counted')
    expect(screen.queryByText('Flight fund')).toBeNull()
    expect(screen.queryByText('Card payments')).toBeNull()
  })

  // Hand-derived: a $40.00 return with no purchase makes the week 90.12.
  it('shows a return as negative spending, and money moved out or unfiled as not counted', async () => {
    const fake = seeded()
    fake.tables.categories.push({ id: 'c5', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null })
    fake.tables.categories.push({ id: 'c6', name: 'Shoes', kind: 'variable', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push(
      { id: 't5', posted_on: '2026-03-12', amount_cents: 4000, merchant_raw: 'SHOE RETURN', category_id: 'c6', source: 'card_pdf' },
      { id: 't6', posted_on: '2026-03-12', amount_cents: -1500, merchant_raw: 'CASH ADVANCE', category_id: 'c5', source: 'card_pdf' },
      // Its category is not among those loaded, so nothing says what it is.
      { id: 't7', posted_on: '2026-03-12', amount_cents: 700, merchant_raw: 'UNKNOWN', category_id: 'gone', source: 'typed' },
    )
    renderScreen(<WeekScreen />, fake)

    expect(await screen.findByText('$90.12')).toBeTruthy()
    expect(within(await categoryRow('Shoes')).getByText('-$40.00')).toBeTruthy()
    expect(screen.getByText('$15.00').closest('p')?.textContent).toBe('Moved out, not spending: $15.00 — not counted')
    expect(screen.getByText('$7.00').closest('p')?.textContent).toBe('Money in with no category: $7.00 — not counted')
  })

  it('shows a readable message when the week cannot be loaded', async () => {
    const fake = seeded()
    fake.fail('transactions', '42501')
    renderScreen(<WeekScreen />, fake)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Could not load this week')).toBeTruthy()
    expect(
      within(alert).getByText('Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)'),
    ).toBeTruthy()
  })
})
