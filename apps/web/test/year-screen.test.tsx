import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YearScreen } from '../src/screens/YearScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon: the gate is September. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, kind: Category['kind']): Category => ({
  id, name, kind, sort_order: 0, weekly_budget_cents: null,
})
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})

/**
 * Hand-derived. Rent is planned at 1,600.00 from January with no charge,
 * so it counts January to September (the gate) and not after: 9 × 1,600 =
 * 14,400.00. Groceries has a 400.00 budget from January, so Expenses are
 * budgeted 400.00 a month, 4,800.00 a year; February spends 120.00 and
 * October 30.00, a real row after the gate, which counts. Pay has a
 * 3,000.00 goal from January and 2,500.00 in September. 500.00 goes to
 * the flight fund in March.
 */
function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      cat('pay', 'Pay', 'income'),
      cat('rent', 'Rent', 'bill'),
      cat('food', 'Groceries', 'variable'),
      cat('fund', 'Flight fund', 'savings'),
    ],
    transactions: [
      tx('t1', '2026-02-10', -12000, 'food'),
      tx('t2', '2026-09-15', 250000, 'pay'),
      tx('t3', '2026-10-02', -3000, 'food'),
      tx('t4', '2027-01-05', -4500, 'food'),
      tx('t5', '2026-03-12', -50000, 'fund'),
    ],
    category_budgets: [
      { id: 'b1', category_id: 'food', month: '2026-01-01', applies: 'onward', budget_cents: 40000 },
      { id: 'b2', category_id: 'pay', month: '2026-01-01', applies: 'onward', budget_cents: 300000 },
    ],
    category_plans: [{ id: 'p1', category_id: 'rent', effective_month: '2026-01-01', planned_cents: 160000, due_day: 1 }],
  })
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

/** A table's rows as their cells' text: month, budget or goal, actual. */
async function rowsOf(name: string) {
  const table = await screen.findByRole('region', { name })
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent))
}

describe('YearScreen', () => {
  it('opens on this calendar year from January, with this month marked', async () => {
    renderScreen(<YearScreen start={null} />, seeded())

    expect(await screen.findByText('January 2026 to December 2026')).toBeTruthy()
    const rows = await rowsOf('Income by month')
    expect(rows).toHaveLength(13)
    expect(rows[8]).toEqual(['September 2026', '3,000.00', '2,500.00'])
    expect(rows[12]).toEqual(['Total', '36,000.00', '2,500.00'])
    const current = screen.getAllByRole('row').filter((r) => r.getAttribute('aria-current') === 'date')
    expect(current.map((r) => r.querySelector('th')?.textContent)).toEqual(['September 2026'])
    // Annual's #F5F1E1 (conditional-format rules 2-5), not the alternating row colour.
    expect(current[0]!.className).toContain('bg-year-today')
  })

  it('counts planned bills up to this month only, and real rows in every month', async () => {
    renderScreen(<YearScreen start="2026-01" />, seeded())
    await screen.findByRole('region', { name: 'Income by month' })

    fireEvent.click(screen.getByRole('button', { name: 'Bills' }))
    const bills = await rowsOf('Bills by month')
    expect(bills.slice(7, 10)).toEqual([
      ['August 2026', '', '1,600.00'],
      ['September 2026', '', '1,600.00'],
      ['October 2026', '', ''],
    ])
    expect(bills[12]).toEqual(['Total', '0.00', '14,400.00'])

    fireEvent.click(screen.getByRole('button', { name: 'Expenses' }))
    const expenses = await rowsOf('Expenses by month')
    expect(expenses[1]).toEqual(['February 2026', '400.00', '1,720.00'])
    expect(expenses[9]).toEqual(['October 2026', '400.00', '30.00'])
    expect(expenses[12]).toEqual(['Total', '4,800.00', '14,550.00'])
    expect(screen.getByRole('button', { name: 'Expenses' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('reads the twelve months from the start, across a year end', async () => {
    renderScreen(<YearScreen start="2026-04" />, seeded())
    fireEvent.click(await screen.findByRole('button', { name: 'Variable' }))
    const variable = await rowsOf('Variable expenses by month')
    // January 2027's 45.00 is in this year; February 2026's 120.00 is not.
    expect(variable[9]).toEqual(['January 2027', '400.00', '45.00'])
    expect(variable[12]).toEqual(['Total', '4,800.00', '75.00'])
  })

  it('reads every goal and monthly amount typed up to the last month, not only the first', async () => {
    const fake = seeded()
    // Typed after the start: a 3,200.00 goal for Pay and Rent at 1,700.00, both from July.
    fake.tables.category_budgets.push({ id: 'b3', category_id: 'pay', month: '2026-07-01', applies: 'onward', budget_cents: 320000 })
    fake.tables.category_plans.push({ id: 'p2', category_id: 'rent', effective_month: '2026-07-01', planned_cents: 170000, due_day: 1 })
    renderScreen(<YearScreen start="2026-01" />, fake)

    expect((await rowsOf('Income by month')).slice(5, 7)).toEqual([
      ['June 2026', '3,000.00', ''],
      ['July 2026', '3,200.00', ''],
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Bills' }))
    expect((await rowsOf('Bills by month')).slice(5, 7)).toEqual([
      ['June 2026', '', '1,600.00'],
      ['July 2026', '', '1,700.00'],
    ])
  })

  it('starts where the picker says, across a year end, through the address', async () => {
    renderScreen(<YearScreen start="2026-01" />, seeded())

    fireEvent.change(screen.getByRole('combobox', { name: 'Start month' }), { target: { value: '04' } })
    expect(window.location.hash).toBe('#/year/2026-04')
    fireEvent.change(screen.getByRole('combobox', { name: 'Start year' }), { target: { value: '2025' } })
    expect(window.location.hash).toBe('#/year/2025-01')

    cleanup()
    renderScreen(<YearScreen start="2026-04" />, seeded())
    expect(await screen.findByText('April 2026 to March 2027')).toBeTruthy()
  })

  it("shows Home's cards at the top, each number the Year's own", async () => {
    const fake = seeded()
    fake.tables.month_balances.push({ id: 'mb1', month: '2026-01-01', starting_balance_cents: 100000 })
    renderScreen(<YearScreen start="2026-01" />, fake, 'Robin')

    const glance = within(await screen.findByRole('region', { name: 'Year at a glance' }))
    expect(glance.getByRole('heading', { name: 'Hi, Robin!' })).toBeTruthy()
    const said = (label: string) => glance.getByText(label).nextElementSibling?.textContent
    // Expenses 14,400.00 of Rent + 150.00 of Groceries; Left over is
    // 2,500.00 − 14,550.00 − 500.00, and the end 1,000.00 more.
    expect([said('Income'), said('Expenses'), said('Savings')]).toEqual(['$2,500.00', '$14,550.00', '$500.00'])
    expect([said('Left over'), said('Starting balance'), said('Ending balance')]).toEqual([
      '-$12,550.00', '$1,000.00', '-$11,550.00',
    ])
    expect(said('Biggest expense')).toBe('Rent$14,400.00')
    expect(said('Best savings month')).toBe('March 2026$500.00')
    // 14,400 of 14,550 is 9,897 bp; 150 of it 103 bp.
    expect(glance.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Rent$14,400.00 · 99%',
      'Groceries$150.00 · 1%',
    ])
  })

  it('asks for a name and a starting balance where they are missing', async () => {
    renderScreen(<YearScreen start="2026-01" />, seeded())

    const glance = within(await screen.findByRole('region', { name: 'Year at a glance' }))
    expect(glance.getByRole('heading', { name: 'Hi!' })).toBeTruthy()
    expect(glance.getAllByText('Not yet')).toHaveLength(2)
    fireEvent.click(glance.getByRole('button', { name: 'Type January’s starting balance on the Month to see these' }))
    expect(window.location.hash).toBe('#/month/2026-01')
  })

  it('shows no year when a read fails, and says why', async () => {
    const fake = seeded()
    fake.fail('category_budgets', 'PGRST205')
    renderScreen(<YearScreen start="2026-01" />, fake)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Could not load this year.*0008/)
    expect(screen.queryByRole('region', { name: 'Income by month' })).toBeNull()
  })
})
