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
  vi.unstubAllGlobals()
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
    // Expenses 14,400.00 of Rent + 150.00 of Groceries; of the 17,550.00 in
    // the pie, income is 1,425 bp, expenses 8,291 and savings 285. Left over
    // is 2,500.00 − 14,550.00 − 500.00, and the end 1,000.00 more.
    const pie = glance.getByRole('img', { name: 'Income, expenses and savings' })
    expect(pie.querySelector('desc')?.textContent).toBe(
      'Income: $2,500.00 · 14%. Expenses: $14,550.00 · 83%. Savings: $500.00 · 3%.',
    )
    // Home's pastels, outlined in Home's label colours.
    expect([...pie.querySelectorAll('path')].map((p) => [p.getAttribute('fill'), p.getAttribute('stroke')])).toEqual([
      ['#D4F8E8', '#36976E'], ['#FFDCE1', '#D66375'], ['#FFECD9', '#FFD05C'],
    ])
    expect([said('Left over'), said('Starting balance'), said('Ending balance')]).toEqual([
      '-$12,550.00', '$1,000.00', '-$11,550.00',
    ])
    // A valid list, so a screen reader pairs each figure with its name
    // (FE-11): only groups of <dt> and <dd> directly inside the <dl>.
    for (const dl of glance.getByText('Left over').closest('section')!.querySelectorAll('dl')) {
      for (const item of dl.children) {
        expect(item.tagName).toBe('DIV')
        expect([...item.children].every((c) => c.tagName === 'DT' || c.tagName === 'DD')).toBe(true)
      }
    }
    expect(said('Biggest expense')).toBe('Rent$14,400.00')
    expect(said('Best savings month')).toBe('March 2026$500.00')
    // 14,400 of 14,550 is 9,897 bp; 150 of it 103 bp. Each has Home's ring
    // in its rank's colour, drawn to its share.
    const top = glance.getAllByRole('listitem')
    expect(top.map((li) => [...li.querySelectorAll(':scope > span')].map((s) => s.textContent))).toEqual([
      ['Rent', '$14,400.00 · 99%'],
      ['Groceries', '$150.00 · 1%'],
    ])
    const rings = top.map((li) => within(li).getByRole('img'))
    expect(rings.map((r) => [r.querySelector('title')?.textContent, r.querySelectorAll('path')[1]?.getAttribute('fill')])).toEqual([
      ['Rent', '#FFAC9E'],
      ['Groceries', '#A9D4D4'],
    ])
  })

  it("draws Annual's income and expenses by month and each list against its goal", async () => {
    renderScreen(<YearScreen start="2026-01" />, seeded())

    const charts = within(await screen.findByRole('region', { name: 'Year charts' }))
    const months = charts.getByRole('img', { name: 'Income and expenses by month' })
    // The tallest column is September, 2,500.00 + 1,600.00: the scale. Its
    // income is 6,098 bp of it, 854 of the plot's 1,400 units.
    expect(months.querySelectorAll('g > title')[8]?.textContent).toBe('Sep: income $2,500.00, expenses $1,600.00')
    const september = [...months.querySelectorAll('g')][9]!
    expect([...september.querySelectorAll('rect')].map((r) => r.getAttribute('height'))).toEqual(['854', '546'])
    const totals = charts.getByRole('img', { name: 'Goals and budgets against actuals' })
    expect(totals.querySelector('desc')?.textContent).toBe(
      'Income: $2,500.00 of $36,000.00. Savings: $500.00 of $0.00. Variable expenses: $150.00 of $4,800.00. ' +
        'Bills: $14,400.00 of $0.00. Debts: $0.00 of $0.00. Subscriptions: $0.00 of $0.00.',
    )
    // One scale, the Income goal of 36,000.00: its 2,500.00 is 694 bp, 97 of
    // 1,400 units, and Bills' 14,400.00 is 4,000 bp, 560 units, with no goal bar.
    const bars = (i: number) =>
      [...[...totals.querySelectorAll('g')][i]!.querySelectorAll('rect')].map((r) => [r.getAttribute('fill'), r.getAttribute('height')])
    expect(bars(1)).toEqual([['#517070', '1400'], ['#E6E1CE', '97']])
    expect(bars(4)).toEqual([['#E6E1CE', '560']])
    // A phone has Home's pie above; Annual's joins the charts on a desktop.
    expect(charts.queryByRole('img', { name: 'Income, expenses and savings' })).toBeNull()
  })

  it('asks for a name and a starting balance where they are missing', async () => {
    renderScreen(<YearScreen start="2026-01" />, seeded())

    const glance = within(await screen.findByRole('region', { name: 'Year at a glance' }))
    expect(glance.getByRole('heading', { name: 'Hi!' })).toBeTruthy()
    expect(glance.getAllByText('Not yet')).toHaveLength(2)
    fireEvent.click(glance.getByRole('button', { name: 'Type January’s starting balance on the Month to see these' }))
    expect(window.location.hash).toBe('#/month/2026-01')
  })

  it('lays a desktop out as Annual does: the totals panel and all seven tables at once', async () => {
    const wide = { matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }
    vi.stubGlobal('matchMedia', () => wide)
    renderScreen(<YearScreen start="2026-01" />, seeded())

    const totals = within(await screen.findByRole('region', { name: 'Year totals' }))
    const said = (label: string) => totals.getByText(label).nextElementSibling?.textContent
    expect([said('Starting month'), said('Current month'), said('Left over'), said('Ending balance')]).toEqual([
      'January 2026', 'September 2026', '-$12,550.00', 'Not yet',
    ])
    fireEvent.click(totals.getByRole('button', { name: 'Type January’s starting balance on the Month to see these' }))
    expect(window.location.hash).toBe('#/month/2026-01')
    const tables = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(tables.filter((t) => t?.endsWith(' by month'))).toEqual([
      'Income by month', 'Expenses by month', 'Savings by month', 'Bills by month',
      'Debts by month', 'Subscriptions by month', 'Variable expenses by month',
    ])
    // No picking one table, and Left over once, in the panel, not again above it.
    expect(screen.queryByRole('group', { name: 'Table' })).toBeNull()
    expect(screen.getAllByText('Left over')).toHaveLength(1)
    expect((await rowsOf('Bills by month'))[8]).toEqual(['Sep 2026', '', '1,600.00'])
    // Annual's pie in the chart row, in Annual's own colours.
    const annual = within(screen.getByRole('region', { name: 'Year charts' })).getByRole('img', {
      name: 'Income, expenses and savings',
    })
    expect([...annual.querySelectorAll('path')].map((p) => p.getAttribute('fill'))).toEqual(['#D7EEEB', '#F9D7D2', '#F7EAA9'])
  })

  it('shows no year when a read fails, and says why', async () => {
    const fake = seeded()
    fake.fail('category_budgets', 'PGRST205')
    renderScreen(<YearScreen start="2026-01" />, fake)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Could not load this year.*Budgets need a one-time update/)
    expect(screen.queryByRole('region', { name: 'Income by month' })).toBeNull()
  })

  it('says the year, not the month, when its budgets or monthly amounts cannot be read (N42)', async () => {
    for (const table of ['category_budgets', 'category_plans']) {
      cleanup()
      const fake = seeded()
      fake.fail(table, '42P01')
      renderScreen(<YearScreen start="2026-01" />, fake)

      const alert = (await screen.findByRole('alert')).textContent ?? ''
      expect(alert, table).toMatch(/need a one-time update, so this year cannot be shown\./)
      expect(alert, table).not.toMatch(/month/)
    }
  })

  it("draws each fund's balance today against its goal, as Home's savings-goals chart, whatever year is shown (D23)", async () => {
    const fake = seeded()
    // 1,000.00 typed at the end of 1 March; the 500.00 on the 12th adds to it.
    fake.tables.savings_goals.push({
      id: 'g1', name: 'Flight', target_cents: 600_000, saved_cents: 100_000, target_date: null, unit_cost_cents: null,
      unit_label: null, category_id: 'fund', start_date: null, balance_as_of: '2026-03-01',
    })
    renderScreen(<YearScreen start="2025-01" />, fake)
    const chart = await screen.findByRole('img', { name: 'Savings goals' })
    expect(chart.textContent).toContain('Flight fund: $1,500.00 of $6,000.00')
    // 1,500 of 6,000 is 2,500 bp: 750 of the 3,000-unit track.
    expect(chart.innerHTML).toMatch(/width="750" height="100" rx="40" fill="#EBD15C"/)
  })

  it('offers to set a goal when no savings fund has one', async () => {
    renderScreen(<YearScreen start={null} />, seeded())
    fireEvent.click(await screen.findByRole('button', { name: 'Set a goal for a savings fund to see it here' }))
    expect(window.location.hash).toBe('#/savings')
  })
})

describe('YearScreen, debts', () => {
  it("draws each debt's balance today over its starting balance, on one scale, as Home's debt chart (D25)", async () => {
    const fake = seeded()
    // $300.00 at 1% a month from July, $100.00 a month: $3.02 left after
    // September. A $600.00 loan at 0% from September, $100.00 a month: $500.00.
    fake.tables.debts.push(
      { id: 'd1', name: 'Loan', starting_balance_cents: 30_000, minimum_payment_cents: 10_000, apr_basis_points: 1_200, start_date: '2026-07-01', sort_order: 0 },
      { id: 'd2', name: 'Car <b>', starting_balance_cents: 60_000, minimum_payment_cents: 10_000, apr_basis_points: 0, start_date: '2026-09-01', sort_order: 1 },
    )
    renderScreen(<YearScreen start="2025-01" />, fake)
    const chart = await screen.findByRole('img', { name: 'Debts' })
    expect(chart.textContent).toContain('Loan: $3.02 left of $300.00. Car <b>: $500.00 left of $600.00.')
    // The scale is $600.00: the loan's track is half of 3,000 units, and
    // the car's $500.00 is 8,333 bp, 2,500 units.
    expect(chart.innerHTML).toMatch(/width="1500" height="100" rx="40" fill="#C8B6EB"/)
    expect(chart.innerHTML).toMatch(/width="2500" height="100" rx="40" fill="#9171D7"/)
  })

  it('offers to add debts when there are none', async () => {
    renderScreen(<YearScreen start={null} />, seeded())
    fireEvent.click(await screen.findByRole('button', { name: 'Add your debts to see them here' }))
    expect(window.location.hash).toBe('#/debts')
  })

  it('says so when debts are typed but none is ever paid off, rather than asking for debts', async () => {
    const fake = seeded()
    // $1,000.00 at 2% a month paying $10.00: never paid off.
    fake.tables.debts.push({ id: 'd1', name: 'Store card', starting_balance_cents: 100_000, minimum_payment_cents: 1_000, apr_basis_points: 2_400, start_date: '2026-01-01', sort_order: 0 })
    renderScreen(<YearScreen start={null} />, fake)
    fireEvent.click(await screen.findByRole('button', { name: 'None of your debts is ever paid off at its minimum. Open Debts to see why' }))
    expect(window.location.hash).toBe('#/debts')
    expect(screen.queryByRole('button', { name: 'Add your debts to see them here' })).toBeNull()
  })
})
