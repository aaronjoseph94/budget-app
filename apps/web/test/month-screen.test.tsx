import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppData } from '../src/app-data.js'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import { useAddress } from '../src/nav.js'
import type { BudgetRow, Category, LedgerRow, PlanRow } from '../src/ledger.js'
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

/** A block once the month's rows are in: the title shows at once, the blocks only after the reads. */
async function loaded(name: string): Promise<ReturnType<typeof within>> {
  return within(await screen.findByRole('region', { name }))
}

const heads = (name: string) => block(name).getAllByRole('columnheader').map((h: HTMLElement) => h.textContent)
const band = (name: string) => block(name).getByRole('heading').nextSibling?.textContent
const cells = (name: string, row: string) =>
  within(block(name).getByRole('rowheader', { name: row }).closest('tr')!).getAllByRole('cell').map((c) => c.textContent)

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
  // No budgets, so each Variable row's Left is 0 − Actual (F5, F16).
  it("fills the workbook's blocks from the month's rows, phone order first", async () => {
    renderScreen(<MonthScreen month={null} />, seeded())

    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
    const order = (await screen.findAllByRole('region')).map((r) => r.getAttribute('aria-label'))
    expect(order).toEqual(['Summary', 'Variable expenses', 'Bills', 'Subscriptions', 'Debts', 'Income', 'Savings', 'Charts'])

    const variable = block('Variable expenses')
    expect(variable.getByText('$85.00')).toBeTruthy()
    expect(variable.getByRole('rowheader', { name: 'Groceries' }).closest('tr')?.textContent).toBe('Groceries100.00-100.00')
    expect(block('Bills').getByText('55.00', { selector: 'td' })).toBeTruthy()
    expect(block('Income').getByText('2,500.00', { selector: 'td' })).toBeTruthy()
    // No goal, so its Difference is what went in (F16).
    expect(cells('Savings', 'Flight fund')).toEqual(['', '300.00', '300.00'])
    // The card payment is in no block.
    expect(screen.queryByText('Card payments')).toBeNull()
  })

  it('shows a return with its minus sign, and a category name as text, never markup', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())

    const clothing = (await screen.findByRole('rowheader', { name: 'Clothing' })).closest('tr')
    expect(clothing?.textContent).toBe('Clothing-40.0040.00')
    expect((await loaded('Variable expenses')).getByText('<b>Dinner & drinks</b>')).toBeTruthy()
    // The chart panel writes it too, inside an SVG it puts into the page.
    expect(block('Charts').getByText('<b>Dinner & drinks</b>', { selector: 'text' })).toBeTruthy()
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
    expect((await loaded('Variable expenses')).getByRole('rowheader', { name: 'Groceries' })).toBeTruthy()
    expect(block('Variable expenses').getByText('99.99', { selector: 'td' })).toBeTruthy()
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

const budget = (id: string, category_id: string, month: string, applies: BudgetRow['applies'], budget_cents: number): BudgetRow => ({
  id, category_id, month, applies, budget_cents,
})

function budgeted(): FakeSupabase {
  const fake = seeded()
  fake.tables.category_budgets.push(
    budget('b1', 'groceries', '2026-07-01', 'onward', 20000),
    // Just September beats August's "from this month on", in September only.
    budget('b2', 'dining', '2026-08-01', 'onward', 5000),
    budget('b3', 'dining', '2026-09-01', 'only', 2000),
    // From October on: never reaches back into September.
    budget('b4', 'clothing', '2026-10-01', 'onward', 9999),
    budget('b5', 'rent', '2026-01-01', 'onward', 160000),
    budget('b6', 'pay', '2026-09-01', 'onward', 300000),
    budget('b7', 'fund', '2026-09-01', 'onward', 50000),
    // On Not spending: kept, and in no block (N30).
    budget('b8', 'card', '2026-09-01', 'onward', 1000),
  )
  return fake
}

describe('MonthScreen budgets and goals', () => {
  // Hand-derived. Groceries 200.00 − 100.00; dining 20.00 − 25.00; clothing
  // no budget: 0 − (−40.00); gifts 0 − 0. Left to spend 100 − 5 + 40 = 135.00.
  it("shows the workbook's columns from the budgets in effect this month, and Left to spend with them", async () => {
    renderScreen(<MonthScreen month="2026-09" />, budgeted())
    await screen.findByRole('region', { name: 'Variable expenses' })

    expect(heads('Variable expenses')).toEqual(['Category', 'Budgeted', 'Actual', 'Left'])
    expect(heads('Bills')).toEqual(['Category', 'Budgeted', 'Actual', 'Left'])
    expect(heads('Income')).toEqual(['Category', 'Goal', 'Actual'])
    expect(heads('Savings')).toEqual(['Category', 'Goal', 'Actual', 'Difference'])

    expect(cells('Variable expenses', 'Groceries')).toEqual(['200.00', '100.00', '100.00'])
    expect(cells('Variable expenses', '<b>Dinner & drinks</b>')).toEqual(['20.00', '25.00', '-5.00'])
    expect(cells('Variable expenses', 'Clothing')).toEqual(['', '-40.00', '40.00'])
    // No budget and nothing spent: blank throughout, not a Left of 0.00.
    fireEvent.click(block('Variable expenses').getByRole('button', { name: 'Show 1 empty' }))
    expect(cells('Variable expenses', 'Gifts')).toEqual(['', '', ''])
    // Budgeted with nothing paid yet, so it no longer folds away; a bill with no budget has no Left (F16).
    expect(cells('Bills', 'Rent')).toEqual(['1,600.00', '', '1,600.00'])
    expect(cells('Bills', 'Phone')).toEqual(['', '55.00', ''])
    expect(cells('Income', 'Pay')).toEqual(['3,000.00', '2,500.00'])
    expect(cells('Savings', 'Flight fund')).toEqual(['500.00', '300.00', '-200.00'])

    expect(band('Variable expenses')).toBe('$85.00 of $220.00')
    expect(band('Bills')).toBe('$55.00 of $1,600.00')
    expect(band('Subscriptions')).toBe('$0.00')
    expect(band('Income')).toBe('$2,500.00 of $3,000.00')
    expect(band('Savings')).toBe('$300.00 of $500.00')

    const summary = within(screen.getByRole('region', { name: 'Summary' }))
    expect(summary.getByText('Left to spend').nextSibling?.textContent).toBe('$135.00')
    expect(summary.queryByText('No budgets on Variable expenses yet.')).toBeNull()
    expect(screen.queryByText('$10.00')).toBeNull()
  })

  it('says so, rather than leave a budget out, when its category did not load (N30)', async () => {
    const fake = budgeted()
    fake.tables.category_budgets.push(budget('b9', 'gone', '2026-09-01', 'onward', 700))
    renderScreen(<MonthScreen month="2026-09" />, fake)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not show this month' +
        'A charge, a budget or a monthly amount this month names a category that did not load, so the month is not shown. Reload to try again.',
    )
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('says Left to spend has no budget while only another list has one', async () => {
    const fake = seeded()
    fake.tables.category_budgets.push(budget('b1', 'rent', '2026-09-01', 'onward', 160000))
    renderScreen(<MonthScreen month="2026-09" />, fake)

    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    expect(summary.getByText('No budgets on Variable expenses yet.')).toBeTruthy()
  })

  it("marks overspending with the workbook's pill and its minus sign, and a fund short of its goal with the sign alone", async () => {
    renderScreen(<MonthScreen month="2026-09" />, budgeted())
    await screen.findByRole('region', { name: 'Variable expenses' })

    const over = block('Variable expenses').getByText('-5.00')
    expect(over.className.split(' ')).toEqual(expect.arrayContaining(['rounded-full', 'bg-spend', 'text-spend-foreground']))
    expect(block('Savings').getByText('-200.00').tagName).toBe('TD')
  })

  // Hand-derived for October: groceries 200.00 from July, dining back to
  // August's 50.00, clothing 99.99 from October; nothing spent. 349.99.
  it('carries a budget into later months, and a "just this month" one into none', async () => {
    renderScreen(<MonthScreen month="2026-10" />, budgeted())
    await screen.findByRole('heading', { name: 'October 2026' })

    expect((await loaded('Variable expenses')).getByRole('rowheader', { name: 'Clothing' })).toBeTruthy()
    expect(cells('Variable expenses', '<b>Dinner & drinks</b>')).toEqual(['50.00', '', '50.00'])
    expect(within(screen.getByRole('region', { name: 'Summary' })).getByText('Left to spend').nextSibling?.textContent).toBe('$349.99')
  })

  it('says in words when budgets cannot be read, and shows no month', async () => {
    const fake = budgeted()
    fake.fail('category_budgets', 'PGRST205')
    renderScreen(<MonthScreen month="2026-09" />, fake)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not load this month' +
        'Budgets need a database update that has not been applied yet (0008 in the setup guide), so this month cannot be shown. (code PGRST205)',
    )
    expect(screen.queryByRole('region')).toBeNull()
  })
})

const plan = (id: string, category_id: string, effective_month: string, planned_cents: number | null, due_day: number | null): PlanRow => ({
  id, category_id, effective_month, planned_cents, due_day,
})

function planned(): FakeSupabase {
  const fake = seeded()
  fake.tables.category_plans.push(
    plan('m1', 'rent', '2026-01-01', 160000, 1),
    // Raised from October: never reaches back into September (D13).
    plan('m2', 'rent', '2026-10-01', 170000, 1),
    // September's real 55.00 replaces it there (D5).
    plan('m3', 'phone', '2026-01-01', 5000, 5),
    plan('m4', 'music', '2026-10-01', 1199, 9),
  )
  return fake
}

describe('MonthScreen planned amounts', () => {
  // Hand-derived. Bills: rent planned 1,600.00 + phone real 55.00 = 1,655.00.
  // Spent: variable 85.00 + 1,655.00 = 1,740.00 (F7).
  it('counts a monthly amount where nothing real is filed, says so, and puts it in Spent', async () => {
    renderScreen(<MonthScreen month="2026-09" />, planned())
    await screen.findByRole('region', { name: 'Bills' })

    expect(cells('Bills', 'Rent')).toEqual(['', '1,600.00planned', ''])
    expect(cells('Bills', 'Phone')).toEqual(['', '55.00', ''])
    expect(band('Bills')).toBe('$1,655.00')
    // Starts in October, so nothing here yet.
    expect(block('Subscriptions').queryByRole('rowheader', { name: 'Music' })).toBeNull()
    const summary = within(screen.getByRole('region', { name: 'Summary' }))
    expect(summary.getByText('Spent').nextSibling?.textContent).toBe('$1,740.00')
  })

  // Hand-derived for October: rent 1,700.00, phone 50.00, music 11.99, all
  // planned, nothing spent: 1,761.99.
  it('shows a month still to come its planned bills, at the amounts in effect then (F10, D13)', async () => {
    renderScreen(<MonthScreen month="2026-10" />, planned())
    await screen.findByRole('heading', { name: 'October 2026' })

    expect((await loaded('Bills')).getByRole('rowheader', { name: 'Rent' })).toBeTruthy()
    expect(cells('Bills', 'Rent')).toEqual(['', '1,700.00planned', ''])
    expect(cells('Bills', 'Phone')).toEqual(['', '50.00planned', ''])
    expect(cells('Subscriptions', 'Music')).toEqual(['', '11.99planned', ''])
    const summary = within(screen.getByRole('region', { name: 'Summary' }))
    expect(summary.getByText('Spent').nextSibling?.textContent).toBe('$1,761.99')
  })

  it('shows no month, rather than one without its planned bills, when they cannot be read', async () => {
    const fake = planned()
    fake.fail('category_plans', 'PGRST205')
    renderScreen(<MonthScreen month="2026-09" />, fake)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not load this month' +
        'Monthly amounts need a database update that has not been applied yet (0009 in the setup guide), so this month cannot be shown. (code PGRST205)',
    )
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('says so, rather than leave a planned bill out, when its category did not load', async () => {
    const fake = planned()
    fake.tables.category_plans.push(plan('m5', 'gone', '2026-01-01', 700, 1))
    renderScreen(<MonthScreen month="2026-09" />, fake)

    expect(within(await screen.findByRole('alert')).getByText('Could not show this month')).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
  })
})

describe('MonthScreen summary and notes', () => {
  // Hand-derived. Spent: variable 85.00 + bills 55.00 = 140.00; savings and
  // the card payment are not spending. No budgets, so Left to spend is
  // 0 − 85.00 (F5).
  it('shows Spent and Left to spend from core, with its minus sign and why', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())

    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    expect(summary.getByText('Spent').nextSibling?.textContent).toBe('$140.00')
    expect(summary.getByText('Left to spend').nextSibling?.textContent).toBe('-$85.00')
    expect(summary.getByText('No budgets on Variable expenses yet.')).toBeTruthy()
  })

  const balance = (id: string, month: string, starting_balance_cents: number) => ({
    id, user_id: 'u1', month, starting_balance_cents,
  })
  const figure = (summary: ReturnType<typeof within>, label: string) => summary.getByText(label).nextSibling as HTMLElement

  // Hand-derived. From 2,400.00: + pay 2,500.00 − spent 140.00 − saved
  // 300.00 = 4,460.00 (F7). The 500.00 card payment is in none of it.
  it("shows the workbook's four numbers in its order, End of month from the start typed for the month", async () => {
    const fake = seeded()
    fake.tables.month_balances.push(balance('m1', '2026-09-01', 240_000))
    renderScreen(<MonthScreen month="2026-09" />, fake)

    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    expect(summary.getAllByRole('term').map((t) => t.textContent)).toEqual(['Start', 'Spent', 'Left to spend', 'End of month'])
    expect(figure(summary, 'Start').textContent).toBe('$2,400.00')
    expect(figure(summary, 'End of month').textContent).toBe('$4,460.00')
  })

  it("asks for the start, and shows no End of month, when none is typed for this month, even with last month's (D17)", async () => {
    const fake = seeded()
    fake.tables.month_balances.push(balance('m1', '2026-08-01', 240_000))
    renderScreen(<MonthScreen month="2026-09" />, fake)

    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    expect(figure(summary, 'Start').textContent).toBe('Type your starting bank balance')
    expect(figure(summary, 'End of month').textContent).toBe('Shown once Start is typed')
    expect(figure(summary, 'Spent').textContent).toBe('$140.00')
  })

  // −3,000.00 + 2,500.00 − 140.00 − 300.00 = −940.00.
  it("marks a negative Left to spend in the workbook's pink, and an overdrawn start and end with their minus sign alone", async () => {
    const fake = seeded()
    fake.tables.month_balances.push(balance('m1', '2026-09-01', -300_000))
    renderScreen(<MonthScreen month="2026-09" />, fake)

    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    const pink = ['bg-summary-negative', 'text-summary-negative-ink']
    const left = figure(summary, 'Left to spend').firstElementChild!
    expect(left.textContent).toBe('-$85.00')
    expect(left.className.split(' ')).toEqual(expect.arrayContaining(pink))
    for (const [label, shown] of [['Start', '-$3,000.00'], ['End of month', '-$940.00']] as const) {
      const value = figure(summary, label)
      expect(value.textContent).toBe(shown)
      // Nothing in it takes the pink, however deep its number sits.
      expect(value.outerHTML).not.toContain('summary-negative')
    }
    cleanup()

    // The workbook's rule is below zero (Jan!D13:E14, lessThan 0): exactly $0.00 left is not pink.
    const even = seeded()
    even.tables.category_budgets.push(budget('b1', 'groceries', '2026-09-01', 'onward', 8500))
    renderScreen(<MonthScreen month="2026-09" />, even)
    const zero = figure(within(await screen.findByRole('region', { name: 'Summary' })), 'Left to spend')
    expect(zero.textContent).toBe('$0.00')
    expect(zero.outerHTML).not.toContain('summary-negative')
    cleanup()

    renderScreen(<MonthScreen month="2026-09" />, budgeted())
    const kept = figure(within(await screen.findByRole('region', { name: 'Summary' })), 'Left to spend').firstElementChild!
    expect(kept.textContent).toBe('$135.00')
    expect(kept.className).not.toContain('summary-negative')
  })

  // Asking for a start that may be stored would invite typing over it.
  it('shows no month, rather than ask for a start, when starting balances cannot be read', async () => {
    const fake = seeded()
    fake.fail('month_balances', 'PGRST205')
    renderScreen(<MonthScreen month="2026-09" />, fake)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not load this month' +
        'Starting balances need a database update that has not been applied yet (0010 in the setup guide), so this month cannot be shown. (code PGRST205)',
    )
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByText('Type your starting bank balance')).toBeNull()
  })

  it('says what was paid to the card, and that it is not counted (D9)', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())

    const note = (await screen.findByText('$500.00')).closest('p')
    expect(note?.textContent).toBe(
      'Paid to your card: $500.00 — not counted. What it paid for is already in the blocks above.',
    )
  })

  it("says how far the latest statement reaches, from the statement's own period", async () => {
    const fake = seeded()
    renderScreen(<MonthScreen month="2026-09" />, fake)
    expect(await screen.findByText('No statement imported yet.')).toBeTruthy()
    cleanup()

    fake.tables.ingest_batches.push(
      { id: 'b1', source: 'card_pdf', created_at: '2026-09-09T10:00:00Z', period_end: '2026-09-07' },
      { id: 'b2', source: 'card_pdf', created_at: '2026-08-09T10:00:00Z', period_end: '2026-08-07' },
    )
    renderScreen(<MonthScreen month="2026-09" />, fake)
    expect(await screen.findByText('Statement imported up to 7 Sep 2026')).toBeTruthy()
  })

  it("puts charges not filed yet in one line at the top, this month's first, and it opens Review", async () => {
    const fake = seeded()
    const pending = (id: string, posted_on: string) => ({
      id, posted_on, amount_cents: -1349, merchant: 'LITWARE COFFEE', merchant_raw: 'LITWARE COFFEE', status: 'pending',
    })
    fake.tables.ingest_candidates.push(pending('p1', '2026-09-03'), pending('p2', '2026-09-29'), pending('p3', '2026-08-20'))
    renderScreen(<MonthScreen month="2026-09" />, fake)

    const banner = await screen.findByRole('button', { name: /Not filed yet: 2 from September waiting for review/ })
    expect(banner.textContent).toContain('— not counted below')
    expect(screen.queryByText('$13.49')).toBeNull()
    fireEvent.click(banner)
    expect(window.location.hash).toBe('#/review')
    cleanup()

    renderScreen(<MonthScreen month="2026-10" />, fake)
    expect(await screen.findByRole('button', { name: '3 from other months waiting for review' })).toBeTruthy()
  })
})

describe("MonthScreen before the app's first load (N35)", () => {
  it('reads nothing and says nothing until the categories are in, then shows the month', async () => {
    const fake = planned()
    // Every table read, as it is answered; the categories are held back.
    const answered: string[] = []
    let release = () => {}
    fake.server.hold = (table) => {
      answered.push(table)
      return table === 'categories' ? new Promise<void>((resolve) => (release = resolve)) : null
    }
    renderScreen(<MonthScreen month="2026-09" />, fake)

    // The app's first load is answered, all but its categories. The goal is
    // read by the app alone, after anything the Month would have asked for.
    await waitFor(() => expect(answered).toContain('savings_goals'))
    expect(answered).not.toContain('transactions')
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()

    fake.server.hold = null
    release()
    expect((await loaded('Bills')).getByRole('rowheader', { name: 'Rent' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('stops saying Loading when the first load fails, which the app says above the screen', async () => {
    const fake = planned()
    fake.fail('categories', '42501')
    renderScreen(<MonthScreen month="2026-09" />, fake)

    expect(screen.getByText('Loading…')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.queryByRole('region')).toBeNull()
  })
})

describe('MonthScreen while another month loads', () => {
  function Routed() {
    return <MonthScreen month={useAddress().param} />
  }

  it("never shows one month's rows or review count under the next month's title", async () => {
    const fake = seeded()
    fake.tables.ingest_candidates.push({
      id: 'p1', posted_on: '2026-09-03', amount_cents: -1349, merchant: 'LITWARE COFFEE', merchant_raw: 'LITWARE COFFEE', status: 'pending',
    })
    window.location.hash = '/month/2026-09'
    renderScreen(<Routed />, fake)
    expect(await screen.findByRole('button', { name: /Not filed yet: 1 from September/ })).toBeTruthy()

    // The address changes; August's reads have not answered yet.
    act(() => {
      window.location.hash = '/month/2026-08'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeTruthy()
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByRole('button', { name: /Not filed yet/ })).toBeNull()

    expect(await screen.findByRole('button', { name: '1 from other months waiting for review' })).toBeTruthy()
  })

  it('still says Loading for the next month after a later reload failed, the categories being in', async () => {
    function Reload() {
      const { refresh, loadError } = useAppData()
      return <button onClick={() => void refresh()}>{loadError === null ? 'Reload' : 'Reload failed'}</button>
    }
    const fake = planned()
    window.location.hash = '/month/2026-09'
    renderScreen(<><Routed /><Reload /></>, fake)
    await loaded('Bills')
    fake.fail('categories', '42501')
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await screen.findByRole('button', { name: 'Reload failed' })

    act(() => {
      window.location.hash = '/month/2026-10'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect((await loaded('Bills')).getByRole('rowheader', { name: 'Rent' })).toBeTruthy()
  })
})

describe('MonthScreen, on a first run', () => {
  // Six empty blocks each saying "Add one in Setup" left the first step
  // unsaid: an account with no categories is sent to Setup once, at the top.
  it('with no categories at all, offers Getting started first, and Setup beside it', async () => {
    renderScreen(<MonthScreen month={null} />, createFakeSupabase())

    const start = await screen.findByRole('region', { name: 'Start here' })
    expect(start.textContent).toContain('New here? Getting started sets up your lists, pay, bills and goals one step at a time')
    fireEvent.click(within(start).getByRole('button', { name: 'Get started' }))
    expect(window.location.hash).toBe('#/start')
    fireEvent.click(within(start).getByRole('button', { name: 'Open Setup' }))
    expect(window.location.hash).toBe('#/setup')
  })

  it('says nothing of the kind once there are categories', async () => {
    renderScreen(<MonthScreen month={null} />, seeded())

    await loaded('Bills')
    expect(screen.queryByRole('region', { name: 'Start here' })).toBeNull()
  })
})
