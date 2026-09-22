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
      { id: 'c1', name: 'Groceries', weekly_budget_cents: 15000 },
      { id: 'c2', name: 'Eating out', weekly_budget_cents: 6000 },
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
