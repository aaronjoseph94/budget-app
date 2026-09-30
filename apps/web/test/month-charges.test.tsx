import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

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
    expect(charges).toEqual([`${MARKUP}20 Sep 2026-$35.88Move to…`, 'CONTOSO MARKET2 Sep 2026-$64.12Move to…'])
    // Another category's charge and August's are not in it.
    expect(sheet.queryByText('TAILSPIN GRILL')).toBeNull()
    expect(sheet.queryByText('NORTHWIND FOODS')).toBeNull()
    await expectNoAxeViolations()
  })

  it('shows a shop name written as markup as text, never as markup', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())
    await screen.findByRole('rowheader', { name: 'Groceries' })

    openRow('Variable expenses', 'Groceries')
    expect(screen.getByText(MARKUP)).toBeTruthy()
    expect(document.querySelector('[role="dialog"] img')).toBeNull()
  })

  it('says a charge was added by hand or by an AI app (0020)', async () => {
    const fake = seeded()
    fake.tables.transactions.push(
      { ...tx('t4', '2026-09-14', -450, 'dining', 'Coffee with Sam'), source: 'typed' },
      { ...tx('t5', '2026-09-15', -1250, 'dining', 'Lunch at Subway'), source: 'ai_app' },
    )
    renderScreen(<MonthScreen month="2026-09" />, fake)
    await screen.findByRole('rowheader', { name: 'Restaurants' })

    const sheet = openRow('Variable expenses', 'Restaurants')
    expect(sheet.getAllByRole('listitem').map((li: HTMLElement) => li.textContent)).toEqual([
      'Lunch at Subway15 Sep 2026 · added by an AI app-$12.50Move to…',
      'Coffee with Sam14 Sep 2026 · added by hand-$4.50Move to…',
      'TAILSPIN GRILL12 Sep 2026-$25.00Move to…',
    ])
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

  it("says a planned row's amount is its monthly amount, which a charge filed there would replace", async () => {
    const fake = seeded()
    fake.tables.category_plans.push({ id: 'm1', category_id: 'rent', effective_month: '2026-01-01', planned_cents: 160000, due_day: 1 })
    renderScreen(<MonthScreen month="2026-09" />, fake)

    await screen.findByRole('rowheader', { name: 'Rent' })
    const sheet = openRow('Bills', 'Rent')
    expect(sheet.getByText(/Bills · September 2026 ·/).textContent).toBe('Bills · September 2026 · $1,600.00 planned')
    expect(sheet.getByText(/^No charges filed here/).textContent).toBe(
      'No charges filed here in September. The amount above is its monthly amount from Setup. A charge filed here counts instead.',
    )
  })
})

async function startMoving(fake: FakeSupabase, merchant: string): Promise<ReturnType<typeof within>> {
  renderScreen(<MonthScreen month="2026-09" />, fake)
  await screen.findByRole('rowheader', { name: 'Groceries' })
  const sheet = openRow('Variable expenses', 'Groceries')
  fireEvent.click(sheet.getByRole('button', { name: new RegExp(`^Move to… \\(${merchant}`) }))
  return sheet
}

describe('Moving a charge from the Month', () => {
  // Hand-derived. Restaurants 25.00 + 64.12 = 89.12; Groceries keeps 35.88.
  it('moves it, learns the shop by default, and re-reads the month', async () => {
    const fake = seeded()
    const sheet = await startMoving(fake, 'CONTOSO MARKET')
    const learn = sheet.getByRole('checkbox', { name: 'Always file CONTOSO MARKET here' })
    expect((learn as HTMLInputElement).checked).toBe(true)
    expect(sheet.getByRole('button', { name: 'Move' }).hasAttribute('disabled')).toBe(true)

    fireEvent.change(sheet.getByRole('combobox', { name: 'Move to' }), { target: { value: 'dining' } })
    // In a sheet titled Groceries, "here" would read as Groceries.
    expect(sheet.getByRole('checkbox', { name: 'Always file CONTOSO MARKET in Restaurants' })).toBe(learn)
    fireEvent.click(sheet.getByRole('button', { name: 'Move' }))

    expect((await sheet.findByRole('status')).textContent).toBe('Moved CONTOSO MARKET to Restaurants.')
    expect(fake.rpcCalls).toEqual([
      { name: 'recategorise_transaction', args: { p_transaction: 't1', p_category: 'dining', p_learn: true } },
    ])
    await waitFor(() => expect(sheet.queryByText('CONTOSO MARKET', { selector: 'p span' })).toBeNull())
    expect(sheet.getByText(/Variable expenses · September 2026 ·/).textContent).toBe(
      'Variable expenses · September 2026 · $35.88',
    )
    const variable = within(screen.getByRole('region', { name: 'Variable expenses' }))
    expect(variable.getByRole('rowheader', { name: 'Restaurants' }).closest('tr')?.textContent).toBe('Restaurants89.12-89.12')
  })

  it('moves only this charge when "Always file" is turned off', async () => {
    const fake = seeded()
    const sheet = await startMoving(fake, 'CONTOSO MARKET')
    fireEvent.click(sheet.getByRole('checkbox', { name: 'Always file CONTOSO MARKET here' }))
    fireEvent.change(sheet.getByRole('combobox', { name: 'Move to' }), { target: { value: 'card' } })
    fireEvent.click(sheet.getByRole('button', { name: 'Move' }))

    await sheet.findByRole('status')
    expect(fake.rpcCalls[0]?.args).toEqual({ p_transaction: 't1', p_category: 'card', p_learn: false })
  })

  it("offers every other category under the workbook's headings, in list order", async () => {
    const sheet = await startMoving(seeded(), 'CONTOSO MARKET')
    const picker = sheet.getByRole('combobox', { name: 'Move to' })
    const groups = [...picker.querySelectorAll('optgroup')].map((g) => [g.label, ...[...g.children].map((o) => o.textContent)])
    expect(groups).toEqual([['Bills', 'Rent'], ['Variable expenses', 'Restaurants'], ['Not spending', 'Card payments']])
    fireEvent.click(sheet.getByRole('button', { name: 'Cancel' }))
    expect(sheet.queryByRole('combobox')).toBeNull()
  })

  it('says why in words when the move is refused, and leaves the charge where it was', async () => {
    const fake = seeded()
    fake.fail('rpc/recategorise_transaction', '42501')
    const sheet = await startMoving(fake, 'CONTOSO MARKET')
    fireEvent.change(sheet.getByRole('combobox', { name: 'Move to' }), { target: { value: 'dining' } })
    fireEvent.click(sheet.getByRole('button', { name: 'Move' }))

    const alert = await sheet.findByRole('alert')
    expect(alert.textContent).toBe(
      'Could not move this chargeThat charge or that category is no longer there — it may have changed on another device. Nothing was moved. (code 42501)',
    )
    expect(sheet.getByText('CONTOSO MARKET', { selector: 'p span' })).toBeTruthy()
    expect(fake.tables.transactions.find((t) => t.id === 't1')?.category_id).toBe('groceries')
    expect(sheet.getByRole('button', { name: 'Move' }).hasAttribute('disabled')).toBe(false)
  })
})

describe('MonthCharges, a busy category (PERF-4)', () => {
  // 208 charges in one category took up to 232 ms to open on a phone, every
  // row with its own Move to… button, so the first 30 are drawn, then all.
  it('draws 30 charges, and all of them on request', async () => {
    const fake = seeded()
    for (let i = 0; i < 40; i += 1) {
      fake.tables.transactions.push(tx(`g${i}`, `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`, -(100 + i), 'groceries', `SHOP ${i}`))
    }
    renderScreen(<MonthScreen month="2026-09" />, fake)
    await screen.findByRole('region', { name: 'Variable expenses' })
    const sheet = openRow('Variable expenses', 'Groceries')

    expect(sheet.getAllByRole('button', { name: /^Move to…/ })).toHaveLength(30)
    fireEvent.click(sheet.getByRole('button', { name: 'Show all 42' }))
    expect(sheet.getAllByRole('button', { name: /^Move to…/ })).toHaveLength(42)
    expect(sheet.queryByRole('button', { name: /^Show all/ })).toBeNull()
  })

  it('moves focus to the first charge it drew, inside the sheet, as its button goes (PERF-10)', async () => {
    const fake = seeded()
    for (let i = 0; i < 40; i += 1) {
      fake.tables.transactions.push(tx(`g${i}`, `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`, -(100 + i), 'groceries', `SHOP ${i}`))
    }
    renderScreen(<MonthScreen month="2026-09" />, fake)
    await screen.findByRole('region', { name: 'Variable expenses' })
    const sheet = openRow('Variable expenses', 'Groceries')

    const more = sheet.getByRole('button', { name: 'Show all 42' })
    more.focus()
    fireEvent.click(more)
    expect(document.activeElement).toBe(sheet.getAllByRole('button', { name: /^Move to…/ })[30])
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })
})

describe('a charge in the main goal’s time (A08, D29)', () => {
  const flight = { id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 0, target_date: null, unit_cost_cents: 27_500, unit_label: 'flight time' }

  it('says what each Variable charge cost in the main goal’s time', async () => {
    // Hand-derived: 35.88 × 60 ÷ 275.00 = 7.83 min, 8; 64.12 × 60 ÷ 275.00 = 13.99 min, 14.
    const fake = seeded()
    fake.tables.savings_goals.push(flight)
    fake.tables.transactions.push(tx('t4', '2026-09-21', 1_200, 'groceries', 'CONTOSO MARKET REFUND'))
    renderScreen(<MonthScreen month="2026-09" />, fake)
    await screen.findByRole('rowheader', { name: 'Groceries' })

    const sheet = openRow('Variable expenses', 'Groceries')
    const times = sheet.getAllByText(/ toward Flight training$/).map((p: HTMLElement) => p.textContent)
    // Newest first; the refund on the 21st costs no time.
    expect(times).toEqual(['= 8 min toward Flight training', '= 14 min toward Flight training'])
  })

  it('says nothing of time for a main goal in dollars, or for a bill', async () => {
    const fake = seeded()
    fake.tables.savings_goals.push({ ...flight, unit_cost_cents: null, unit_label: null })
    fake.tables.transactions.push(tx('t5', '2026-09-01', -160_000, 'rent', 'FABRIKAM RENT'))
    renderScreen(<MonthScreen month="2026-09" />, fake)
    await screen.findByRole('rowheader', { name: 'Groceries' })
    expect(openRow('Variable expenses', 'Groceries').queryByText(/ toward /)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fake.tables.savings_goals[0] = flight
    cleanup()
    renderScreen(<MonthScreen month="2026-09" />, fake)
    await screen.findByRole('rowheader', { name: 'Rent' })
    expect(openRow('Bills', 'Rent').queryByText(/ toward /)).toBeNull()
  })
})

describe('MonthCharges, Not spending (N26)', () => {
  it('opens the charges filed under Not spending, so one filed there by mistake can be moved back', async () => {
    const fake = seeded()
    fake.tables.transactions.push(tx('t5', '2026-09-15', 50000, 'card', 'CARD PAYMENT THANK YOU'))
    fake.tables.transactions.push(tx('t6', '2026-09-16', -4200, 'card', 'CONTOSO MARKET'))
    renderScreen(<MonthScreen month="2026-09" />, fake)

    fireEvent.click(await screen.findByRole('button', { name: 'See these charges' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Not spending' }))
    expect(sheet.getAllByRole('button', { name: /^Move to…/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Move to… (CONTOSO MARKET, 16 Sep 2026)',
      'Move to… (CARD PAYMENT THANK YOU, 15 Sep 2026)',
    ])

    fireEvent.click(sheet.getByRole('button', { name: 'Move to… (CONTOSO MARKET, 16 Sep 2026)' }))
    const options = within(sheet.getByRole('combobox', { name: 'Move to' })).getAllByRole('option').map((o) => o.textContent)
    // Anywhere but where it is.
    expect(options).toContain('Groceries')
    expect(options).not.toContain('Card payments')
  })

  it('offers nothing to open when nothing is filed there', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded())
    await screen.findByRole('region', { name: 'Variable expenses' })
    expect(screen.queryByRole('button', { name: 'See these charges' })).toBeNull()
  })
})
