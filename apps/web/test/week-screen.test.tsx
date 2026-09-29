import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeekScreen as Week } from '../src/screens/WeekScreen.js'
import { useAddress } from '../src/nav.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

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

/** A figure on the summary card, once the week is in; the blocks' own are WeekBlocks' tests'. */
const summary = async (label: string) =>
  within(await screen.findByRole('region', { name: 'Summary' })).getByText(label).nextSibling?.textContent
const cells = async (block: string, row: string) =>
  within(within(await screen.findByRole('region', { name: block })).getByRole('rowheader', { name: row }).closest('tr')!)
    .getAllByRole('cell')
    .map((c) => c.textContent)

/** The Week as App renders it, its Monday read from the address the arrows write. */
function WeekScreen() {
  return <Week monday={useAddress().param} />
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

describe('WeekScreen', () => {
  // Hand-derived: spent 64.12 + 18.45 + 47.55 = 130.12. Left (F5): 150.00 −
  // 64.12 = 85.88 and 60.00 − 66.00 = −6.00, so 79.88. The Sunday before is out.
  it("shows this week's blocks, with each category's weekly budget as its Budgeted", async () => {
    renderScreen(<WeekScreen />, seeded())

    expect(await summary('Spent')).toBe('$130.12')
    expect(await summary('Left to spend')).toBe('$79.88')
    expect(screen.getByRole('heading', { name: 'This week' })).toBeTruthy()
    expect(screen.getByText(/5 days left/)).toBeTruthy()
    expect(await cells('Variable expenses', 'Groceries')).toEqual(['150.00', '64.12', '85.88'])
    expect(await cells('Variable expenses', 'Eating out')).toEqual(['60.00', '66.00', '-6.00'])
    await expectNoAxeViolations()
  })

  it('says how many wait for review, and the banner opens Review', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    renderScreen(<WeekScreen />, seeded())

    const banner = await screen.findByRole('button', { name: /2 waiting for review/ })
    // Waiting's amber, as on the Month (ADR 0010), never a list's orange.
    expect(banner.className.split(' ')).toEqual(expect.arrayContaining(['bg-waiting', 'border-waiting-border', 'text-waiting-ink']))
    fireEvent.click(banner)
    expect(window.location.hash).toBe('#/review')
  })

  it('steps back a week and counts only that week', async () => {
    renderScreen(<WeekScreen />, seeded())
    expect(await summary('Spent')).toBe('$130.12')

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))

    expect(await screen.findByRole('heading', { name: 'Week of' })).toBeTruthy()
    await waitFor(async () => expect(await summary('Spent')).toBe('$99.99'))
    expect(screen.queryByText(/days left/)).toBeNull()
  })

  it('opens the week its address names, and writes each step into the address (ADR 0006)', async () => {
    window.location.hash = '/week/2026-03-02'
    renderScreen(<WeekScreen />, seeded())

    expect(await screen.findByRole('heading', { name: 'Week of' })).toBeTruthy()
    await waitFor(async () => expect(await summary('Spent')).toBe('$99.99'))

    // Back on this week the address is bare again, so it still means this week next week.
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(window.location.hash).toBe('#/week')
    expect(await screen.findByRole('heading', { name: 'This week' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(window.location.hash).toBe('#/week/2026-03-02')
  })

  // Hand-derived: Left is 10.00 − 64.12 and 60.00 − 66.00, 60.12 below zero.
  // Back on this week, its days left count from today, not from its Monday.
  it('shows an overspent week below zero, and steps forward again to today', async () => {
    const fake = seeded()
    fake.tables.categories[0] = { id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 1000 }
    renderScreen(<WeekScreen />, fake)

    expect(await summary('Left to spend')).toBe('-$60.12')
    expect(screen.getByRole('button', { name: 'Next week' })).toHaveProperty('disabled', true)
    // Mockup A's stepper: the week's dates between its two arrows.
    expect(screen.getByRole('button', { name: 'Next week' }).previousElementSibling?.textContent).toBe('9 – 15 Mar')

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await screen.findByRole('heading', { name: 'Week of' })
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(await screen.findByRole('heading', { name: 'This week' })).toBeTruthy()
    expect(await screen.findByText(/5 days left/)).toBeTruthy()
  })

  // Rent is due on the 10th, in this week; the phone on the 20th is not (F8).
  it('reads the monthly amounts and counts a bill due on a day of this week', async () => {
    const fake = seeded()
    fake.tables.categories.push({ id: 'rent', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null })
    fake.tables.category_plans.push({ id: 'pl1', category_id: 'rent', effective_month: '2026-01-01', planned_cents: 160000, due_day: 10 })
    renderScreen(<WeekScreen />, fake)

    expect(await summary('Spent')).toBe('$1,730.12')
    expect(await cells('Bills', 'Rent')).toEqual(['1,600.00planned', '1,600.00planned', '0.00'])
  })

  // Monday 23 February to Sunday 1 March: the rent typed from March, due on
  // the 1st, is paid in this week though the week starts in February (D13).
  it("reads the monthly amounts of a week's last month when it runs across a month end", async () => {
    const fake = seeded()
    fake.tables.categories.push({ id: 'rent', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null })
    fake.tables.category_plans.push({ id: 'pl1', category_id: 'rent', effective_month: '2026-03-01', planned_cents: 170000, due_day: 1 })
    renderScreen(<WeekScreen />, fake)
    expect(await summary('Spent')).toBe('$130.12')

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await waitFor(async () => expect(await summary('Spent')).toBe('$99.99'))
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await waitFor(async () => expect(await cells('Bills', 'Rent')).toEqual(['1,700.00planned', '1,700.00planned', '0.00']))
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
    // Mockup A's wide card tinted to the accent, its ring drawn from core's 2,817 bp.
    const card = screen.getByRole('region', { name: 'Flight training' })
    expect(card.className.split(' ')).toEqual(expect.arrayContaining(['bg-linear-to-b', 'to-primary-tint']))
    expect(card.querySelector('circle[pathLength]')?.getAttribute('stroke-dasharray')).toBe('28.17 100')
    expect(screen.getByText('$8,450.00')).toBeTruthy()
    expect(screen.getByText('of $30,000.00 · $21,550.00 to go')).toBeTruthy()
    expect(screen.getByText('$10,775.00')).toBeTruthy()
    expect(await screen.findByText('28 min')).toBeTruthy()
    // The owner's one goal: nothing else to point to (G1).
    expect(screen.queryByRole('link', { name: /other goal/ })).toBeNull()
    await expectNoAxeViolations()
  })

  // Hand-derived: 8,450.00 typed at the end of 1 March, and 200.00 moved in
  // on the 5th (D16): 8,650.00, which Savings shows too.
  it("shows a fund's goal with the balance its transfers keep", async () => {
    const fake = seeded()
    fake.tables.categories.push({ id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push({ id: 't9', posted_on: '2026-03-05', amount_cents: -20_000, merchant_raw: 'TO FLIGHT FUND', category_id: 'c4', source: 'typed' })
    fake.tables.savings_goals.push({
      id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 845_000, target_date: null,
      unit_cost_cents: null, unit_label: null, category_id: 'c4', start_date: null, balance_as_of: '2026-03-01',
    })
    renderScreen(<WeekScreen />, fake)

    expect(await screen.findByText('$8,650.00')).toBeTruthy()
    expect(screen.getByText('of $30,000.00 · $21,350.00 to go')).toBeTruthy()
  })

  // Hand-derived: 100.00 typed at the end of 1 March, and 500.00 taken out on
  // the 5th: -400.00, which core gives as -133 bp. The ring draws no arc: a
  // negative dash length is invalid SVG, which draws the whole ring.
  it('draws no arc on the ring when withdrawals took the fund below zero', async () => {
    const fake = seeded()
    fake.tables.categories.push({ id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push({ id: 't9', posted_on: '2026-03-05', amount_cents: 50_000, merchant_raw: 'FROM FLIGHT FUND', category_id: 'c4', source: 'typed' })
    fake.tables.savings_goals.push({
      id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 10_000, target_date: null,
      unit_cost_cents: null, unit_label: null, category_id: 'c4', start_date: null, balance_as_of: '2026-03-01',
    })
    renderScreen(<WeekScreen />, fake)

    expect(await screen.findByText('-$400.00')).toBeTruthy()
    const card = screen.getByRole('region', { name: 'Flight training' })
    expect(card.querySelectorAll('circle')).toHaveLength(1)
    expect(card.querySelector('circle[stroke-dasharray]')).toBeNull()
  })

  // Goals are added on Savings now (G1), not in Settings.
  it('without a goal, offers to add one where the goal would be', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    renderScreen(<WeekScreen />, seeded())

    // A link: jsdom does not follow its hash, so the address it names is checked.
    expect((await screen.findByRole('link', { name: 'Add a goal' })).getAttribute('href')).toBe('#/savings')
  })

  it('shows the main goal, with how many others there are, and none that is paused (G1)', async () => {
    const fake = seeded()
    const goal = (id: string, name: string, more: Record<string, unknown>) => ({
      id, name, target_cents: 100_000, saved_cents: 15_000, target_date: null, unit_cost_cents: null, unit_label: null, ...more,
    })
    fake.tables.savings_goals.push(
      goal('g1', 'Flight training', { sort_order: 1, unit_cost_cents: 27_500, unit_label: 'flight time' }),
      goal('g2', 'Travel', { sort_order: 0 }),
      goal('g3', 'House', { sort_order: 2 }),
      goal('g4', 'Car', { status: 'paused' }),
    )
    renderScreen(<WeekScreen />, fake)

    expect(await screen.findByRole('heading', { name: 'Travel' })).toBeTruthy()
    expect(screen.getByText('of $1,000.00 · $850.00 to go')).toBeTruthy()
    expect(screen.getByRole('link', { name: '2 other goals' }).getAttribute('href')).toBe('#/savings')
  })

  it('says when no goal is active, and where to resume one', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const fake = seeded()
    fake.tables.savings_goals.push({
      id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 0, target_date: null, unit_cost_cents: null, unit_label: null, status: 'paused',
    })
    renderScreen(<WeekScreen />, fake)

    expect(await screen.findByText(/^No active savings goal\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Resume or add one' }).getAttribute('href')).toBe('#/savings')
  })

  it('without budgets, shows the spend and the money in', async () => {
    const fake = seeded()
    fake.tables.categories = fake.tables.categories.map((c) => ({ ...c, weekly_budget_cents: null }))
    // In a category of its own, so it nets positive: money in, not a refund.
    fake.tables.categories.push({ id: 'c3', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push({ id: 't5', posted_on: '2026-03-12', amount_cents: 2500, merchant_raw: 'PAYROLL', category_id: 'c3', source: 'typed' })
    renderScreen(<WeekScreen />, fake)

    expect(await summary('Spent')).toBe('$130.12')
    expect(screen.getByText('No weekly budgets on Variable expenses yet.')).toBeTruthy()
    expect(await cells('Income', 'Pay')).toEqual(['', '25.00'])
  })

  // Hand-derived: the $500.00 card payment is in no block and the $200.00
  // move is Savings, so spent stays 130.12 and money in is the 25.00 pay.
  it('leaves a card payment and a savings move out of spending, and says so', async () => {
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

    expect(await summary('Spent')).toBe('$130.12')
    expect(await cells('Savings', 'Flight fund')).toEqual(['', '200.00', '200.00'])
    expect(screen.getByText('$500.00').closest('p')?.textContent).toMatch(/^Paid to your card: \$500\.00 — not counted\./)
    expect(screen.queryByText('Card payments')).toBeNull()
  })

  // Hand-derived: a $40.00 return with no purchase makes the week 90.12.
  it('shows a return as negative spending, money moved out as not counted, and no week with a row it cannot file', async () => {
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

    expect(await screen.findByText('Could not show this week')).toBeTruthy()
    fake.tables.transactions.pop()
    cleanup()
    renderScreen(<WeekScreen />, fake)
    expect(await summary('Spent')).toBe('$90.12')
    expect((await cells('Variable expenses', 'Shoes'))[1]).toBe('-40.00')
    expect(screen.getByText('$15.00').closest('p')?.textContent).toBe('Moved out, not spending: $15.00 — not counted. See these charges')
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

  // As on the Month (N35): rows read before the categories arrive would name
  // categories the screen does not know yet.
  it('reads no rows before the app has its categories', async () => {
    const fake = seeded()
    const answered: string[] = []
    let release = () => {}
    fake.server.hold = (table) => {
      answered.push(table)
      return table === 'categories' ? new Promise<void>((resolve) => (release = resolve)) : null
    }
    renderScreen(<WeekScreen />, fake)

    // The goal is read by the app alone, after anything the Week would have asked for.
    await waitFor(() => expect(answered).toContain('savings_goals'))
    expect(answered).not.toContain('transactions')
    expect(screen.queryByRole('alert')).toBeNull()

    fake.server.hold = null
    release()
    expect((await screen.findAllByText('$130.12')).length).toBeGreaterThan(0)
  })

  it("shows no figures under the next week's dates until its rows are in", async () => {
    const fake = seeded()
    renderScreen(<WeekScreen />, fake)
    expect((await screen.findAllByText('$130.12')).length).toBeGreaterThan(0)

    // Every read of the ledger is held: the week's own, and last week's for the comparison.
    const held: (() => void)[] = []
    fake.server.hold = (table) => (table === 'transactions' ? new Promise<void>((resolve) => held.push(resolve)) : null)
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))

    expect(await screen.findByRole('heading', { name: 'Week of' })).toBeTruthy()
    // Not this week's figures, and not a $0 week either: no figures at all.
    expect(screen.queryByText('Spent')).toBeNull()

    fake.server.hold = null
    held.forEach((release) => release())
    expect((await screen.findAllByText('$99.99')).length).toBeGreaterThan(0)
  })

  it('stops showing the loading card when the first load fails, which the app says above the screen', async () => {
    const fake = seeded()
    fake.fail('categories', '42501')
    renderScreen(<WeekScreen />, fake)

    // Found as a screen reader finds it, not by its animation class (CR-10).
    expect(screen.getByRole('status', { name: 'Loading this week' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading this week' })).toBeNull())
    expect(screen.queryByText('$130.12')).toBeNull()
  })
})

describe('WeekScreen, a row opened (N46)', () => {
  it("opens the week's charges filed under it, named with the week's dates, each with Move to…", async () => {
    renderScreen(<WeekScreen />, seeded())
    const block = within(await screen.findByRole('region', { name: 'Variable expenses' }))
    fireEvent.click(block.getByRole('button', { name: 'Eating out' }))

    const sheet = within(screen.getByRole('dialog', { name: 'Eating out' }))
    expect(sheet.getByText(/^Variable expenses · 9 – 15 Mar ·/)).toBeTruthy()
    // This week's two, and never last week's.
    expect(sheet.getAllByRole('button', { name: /^Move to…/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Move to… (FABRIKAM PIZZA, 11 Mar 2026)',
      'Move to… (NORTHWIND DINER, 10 Mar 2026)',
    ])
    fireEvent.click(sheet.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
