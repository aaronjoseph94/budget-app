import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DebtsScreen } from '../src/screens/DebtsScreen.js'
import type { DebtRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const debt = (id: string, name: string, cents: number, minimum: number, apr: number, start: string, sort: number): DebtRow => ({
  id, name, starting_balance_cents: cents, minimum_payment_cents: minimum, apr_basis_points: apr, start_date: start, sort_order: sort,
})

// Hand-derived, as debts.test.tsx. Loan: $300.00 at 12% from July, $100.00
// a month: $3.02 left after September, paid off in October. Car <b>: $50.00
// at 0% from September with a $25.00 extra: paid off in September. Next
// year's: starts in 2027, so it stands at what was typed. Together 34,698
// paid of 55,000 starting: 6,308.7 bp, 63%.
function seeded(): FakeSupabase {
  return createFakeSupabase({
    debts: [
      debt('car', 'Car <b>loan</b>', 5_000, 2_500, 0, '2026-09-01', 1),
      debt('loan', 'Loan', 30_000, 10_000, 1_200, '2026-07-01', 0),
      debt('later', "Next year's", 20_000, 5_000, 1_999, '2027-01-01', 2),
    ],
    debt_extra_payments: [{ id: 'x1', debt_id: 'car', month: '2026-09-01', amount_cents: 2_500 }],
  })
}

const lines = (region: HTMLElement) => [...region.querySelectorAll('h2, p, dt, dd')].map((e) => e.textContent)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('DebtsScreen', () => {
  it("says what the debts here are, and that they are not the Month's Debts list", async () => {
    renderScreen(<DebtsScreen />, seeded())
    await screen.findByRole('region', { name: 'Debt summary' })
    expect(screen.getByText(/separate from the Month’s Debts list, which counts the payments you make/)).toBeTruthy()
    expect(screen.getByText(/give it no monthly amount on the Month’s Debts list/)).toBeTruthy()
    await expectNoAxeViolations()
  })

  it("gives each debt a card in the screen's order, its name as text", async () => {
    renderScreen(<DebtsScreen />, seeded())
    await screen.findByRole('region', { name: 'Loan' })
    const cards = within(screen.getAllByRole('list')[0]!).getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(cards).toEqual(['Loan', 'Car <b>loan</b>', "Next year's"])
    expect(screen.getByRole('heading', { name: 'Car <b>loan</b>' })).toBeTruthy()
  })

  it("shows a debt's balance today, its figures and the month it is paid off", async () => {
    renderScreen(<DebtsScreen />, seeded())
    expect(lines(await screen.findByRole('region', { name: 'Loan' }))).toEqual([
      'Loan', 'Balance today', '▼ $98.98 less (97%) than at the end of August',
      'Starting balance', '$300.00', 'APR', '12%', 'Minimum payment', '$100.00', 'Paid off in', 'October 2026',
    ])
    expect(within(screen.getByRole('region', { name: 'Loan' })).getByText('$3.02')).toBeTruthy()
    const later = screen.getByRole('region', { name: "Next year's" })
    expect(within(later).getAllByText('$200.00')).toHaveLength(2)
    expect(within(later).getByText('Starts January 2027')).toBeTruthy()
    expect(within(later).getByText('19.99%')).toBeTruthy()
  })

  it('adds the debts into the summary: the total today, debt-free month, this month and progress', async () => {
    renderScreen(<DebtsScreen />, seeded())
    const summary = await screen.findByRole('region', { name: 'Debt summary' })
    expect([...summary.querySelectorAll('dt, dd')].map((e) => e.textContent)).toEqual([
      'Current debt total', '$203.02',
      'Debt-free by', 'May 2027',
      'Paid this month', '$150.00',
      'Payoff progress', '63%$346.98 of $550.00',
    ])
    expect(within(summary).getByRole('img', { name: 'All debts: paid and left' })).toBeTruthy()
    // Below 360 px the ring goes under, and the total has its row (N67):
    // jsdom lays nothing out, so the classes that decide it.
    expect(summary.className).toMatch(/(^|\s)grid-cols-1(\s|$)/)
    expect(summary.querySelector('dt')!.parentElement!.className).toContain('max-[359px]:col-span-2')
  })

  it("sets Mockup A's title row, and tints the summary and the plan it follows", async () => {
    renderScreen(<DebtsScreen />, seeded())
    const summary = await screen.findByRole('region', { name: 'Debt summary' })
    const header = screen.getByRole('heading', { level: 1, name: 'Debt payoff' }).closest('header')!
    expect(within(header).getByRole('button', { name: 'Add a debt' })).toBeTruthy()
    expect(summary.className).toContain('to-primary-tint')
    // Two by two beside the ring until 1280px, four across from there (P2 item 13).
    expect(summary.querySelector('dl')!.className).toMatch(/(^|\s)grid-cols-2(\s|$)/)
    expect(summary.querySelector('dl')!.className).toContain('xl:grid-cols-4')
    // Minimums only is the plan the summary's debt-free month follows, and the one tinted.
    const plans = screen.getByRole('region', { name: 'Payoff plans' })
    const tinted = within(plans).getAllByRole('listitem').filter((c) => c.className.includes('bg-primary-tint'))
    expect(tinted.map((c) => c.getAttribute('aria-label'))).toEqual(['Minimums only'])
    expect(within(tinted[0]!).getByText('May 2027')).toBeTruthy()
  })

  it('names a debt that is never paid off, and plans the rest', async () => {
    const fake = seeded()
    fake.tables.debts.push(debt('card', 'Store card', 100_000, 1_000, 2_400, '2026-01-01', 3))
    renderScreen(<DebtsScreen />, fake)
    expect(await screen.findByText('Store card is never paid off')).toBeTruthy()
    const card = screen.getByRole('region', { name: 'Store card' })
    expect(within(card).getByText('Never')).toBeTruthy()
    expect(within(card).getByText('—')).toBeTruthy()
    expect(within(card).queryByText('$1,000.00', { selector: '.text-2xl' })).toBeNull()
    const summary = screen.getByRole('region', { name: 'Debt summary' })
    expect(within(summary).getByText('Not until every minimum covers its interest')).toBeTruthy()
    // The totals are the other three alone, as before, and say which is left out.
    expect(within(summary).getByText('$203.02')).toBeTruthy()
    expect(within(summary).getByText('Not in these totals, because they are never paid off: Store card.')).toBeTruthy()
  })

  it('says so with no debts, and why when they cannot be read', async () => {
    renderScreen(<DebtsScreen />, createFakeSupabase())
    expect(await screen.findByText('No debts yet. Add one to see when it is paid off.')).toBeTruthy()
    cleanup()
    const fake = seeded()
    fake.fail('debts', 'PGRST205')
    renderScreen(<DebtsScreen />, fake)
    expect(await screen.findByText(/Debts need a one-time update/)).toBeTruthy()
  })
})

describe('DebtsScreen, payoff plans', () => {
  it('shows the debt-free month and interest on three plans, side by side', async () => {
    // Loan and the car only, both hand-derived in debt-strategy's terms:
    // the car clears in September with nothing over, so no plan has money
    // to roll before the loan's last $3.05 in October; every plan agrees.
    const fake = seeded()
    fake.tables.debts.splice(fake.tables.debts.findIndex((d) => d.id === 'later'), 1)
    renderScreen(<DebtsScreen />, fake)
    const plans = await screen.findByRole('region', { name: 'Payoff plans' })
    const cards = within(plans).getAllByRole('listitem')
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(['Minimums only', 'Snowball', 'Avalanche'])
    // Loan interest: 200 + 102 + 3.
    for (const c of cards) expect([...c.querySelectorAll('dd')].map((d) => d.textContent)).toEqual(['October 2026', '$3.05'])
  })

  it("rolls a cleared debt's payment into the smallest balance or the highest APR, and says when a plan never ends", async () => {
    // debt-strategy.test.ts's three, from September: Z $100 at 0%, X $600 at
    // 12%, Y $300 at 0%, $100.00 a month each. Minimums only: X is paid in
    // March with $15.55 of interest. Snowball (Z, Y, X): December, $10.14.
    // Avalanche (X first): December, $9.13.
    const fake = createFakeSupabase({
      debts: [
        debt('z', 'Z', 10_000, 10_000, 0, '2026-09-01', 0),
        debt('x', 'X', 60_000, 10_000, 1_200, '2026-09-01', 1),
        debt('y', 'Y', 30_000, 10_000, 0, '2026-09-01', 2),
      ],
    })
    renderScreen(<DebtsScreen />, fake)
    const plans = await screen.findByRole('region', { name: 'Payoff plans' })
    const figures = (name: string) => within(within(plans).getByRole('listitem', { name })).getAllByRole('definition').map((d) => d.textContent)
    expect([figures('Minimums only'), figures('Snowball'), figures('Avalanche')]).toEqual([
      ['March 2027', '$15.55'],
      ['December 2026', '$10.14'],
      ['December 2026', '$9.13'],
    ])
    cleanup()
    renderScreen(<DebtsScreen />, createFakeSupabase({ debts: [debt('c', 'Store card', 100_000, 1_000, 2_400, '2026-01-01', 0)] }))
    const never = await screen.findByRole('region', { name: 'Payoff plans' })
    expect(within(never).getAllByText('Not within 50 years')).toHaveLength(3)
  })
})
