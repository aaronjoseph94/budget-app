import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaycheckPeriod } from '../src/screens/PaycheckPeriod.js'
import type { Category, PayScheduleRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Wednesday 23 September 2026, local noon. Paid every two weeks from Friday
// 11 September, so this pay period is 11 to 24 September. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const category = (id: string, name: string, kind: Category['kind']): Category => ({
  id, name, kind, sort_order: 0, weekly_budget_cents: null,
})
const PAY = category('pay', 'Day job', 'income')
const BIWEEKLY: PayScheduleRow = { id: 's1', category_id: 'pay', first_pay_date: '2026-09-11', frequency: 'biweekly' }
const txn = (id: string, postedOn: string, cents: number, categoryId: string) => ({
  id, posted_on: postedOn, amount_cents: cents, merchant_raw: 'NORTHWIND MARKET', category_id: categoryId, source: 'typed',
})

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [PAY, category('rent', 'Rent', 'bill'), category('stream', 'Streaming', 'subscription'),
      category('food', 'Groceries', 'variable'), category('card', 'Card payments', 'transfer')],
    category_plans: [{ id: 'p1', category_id: 'rent', effective_month: '2026-01-01', planned_cents: 160_000, due_day: 1 },
      { id: 'p2', category_id: 'stream', effective_month: '2026-01-01', planned_cents: 1_799, due_day: 20 }],
    category_budgets: [{ id: 'b1', category_id: 'food', month: '2026-09-01', applies: 'onward', budget_cents: 60_000 },
      { id: 'b2', category_id: 'pay', month: '2026-09-01', applies: 'onward', budget_cents: 500_000 }],
    transactions: [txn('t1', '2026-09-12', -4_500, 'food'), txn('t2', '2026-09-25', -2_000, 'food'),
      txn('t3', '2026-09-20', -1_799, 'stream'), txn('t4', '2026-09-11', 250_000, 'pay'), txn('t5', '2026-09-15', 50_000, 'card')],
  })
}
const show = (fake: FakeSupabase, day: string | null, row = BIWEEKLY) =>
  renderScreen(<PaycheckPeriod day={day} source={PAY} row={row} />, fake)
const summary = async (label: string) =>
  within(await screen.findByRole('region', { name: 'Summary' })).getByText(label).nextSibling?.textContent
const cells = async (block: string, row: string) =>
  within(within(await screen.findByRole('region', { name: block })).getByRole('rowheader', { name: row }).closest('tr')!)
    .getAllByRole('cell')
    .map((c) => c.textContent)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('PaycheckPeriod', () => {
  // Hand-derived (F15): Rent 1600.00 × 12 ÷ 26 = 738.46, whatever its due day;
  // Streaming's real 17.99 replaces its share; Groceries 600.00 → 276.92, less
  // 45.00 spent (the 25th is the next period); Pay's goal 5000.00 → 2307.69.
  // Spent 738.46 + 17.99 + 45.00 = 801.45.
  it("shows this pay period's blocks, each monthly amount and budget as its share", async () => {
    show(seeded(), null)

    expect(await summary('Spent')).toBe('$801.45')
    expect(await summary('Left to spend')).toBe('$231.92')
    expect(screen.queryByText(/No budgets on Variable expenses/)).toBeNull()
    expect(await cells('Bills', 'Rent')).toEqual(['738.46planned', '738.46planned', '0.00'])
    // Its share, 17.99 × 12 ÷ 26 = 8.30, stands as its budget (F51): 9.69 over.
    expect(await cells('Subscriptions', 'Streaming')).toEqual(['8.30planned', '17.99', '-9.69'])
    expect(await cells('Variable expenses', 'Groceries')).toEqual(['276.92', '45.00', '231.92'])
    expect(await cells('Income', 'Day job')).toEqual(['2,307.69', '2,500.00'])
    // Typed on the Month, so shown here and not typed.
    expect(screen.queryByRole('button', { name: /^Budget for Groceries/ })).toBeNull()

    expect(screen.getByRole('heading', { name: 'This pay period' })).toBeTruthy()
    expect(screen.getByText('11 – 24 Sep · Day job, paid bi-weekly')).toBeTruthy()
    // Mockup A shows the card's name as its heading, which it had only for a screen reader.
    expect(screen.getByRole('region', { name: 'How this period is counted' }).textContent).toBe(
      'How this period is counted' +
      'Bills with no charge yet in this period, and budgets and goals, are September 2026’s. You are paid every two weeks, so each shows 12 months over 26 paydays: two weeks’ share. Charges count as they are.Budgets and goals are typed on the Month.',
    )
    expect(screen.getByText('$500.00').closest('p')?.textContent).toBe(
      'Paid to your card: $500.00 — not counted. What it paid for is already in the blocks above. See these charges',
    )
    await expectNoAxeViolations()
  })

  // Mockup A, step 4: the Week's stat cards, the wide tinted card beside
  // them, the Month's stepper with the period's dates, and the lists two
  // across in list order.
  it('draws the summary as stat cards, how it is counted as a wide tinted card, and the lists in list order', async () => {
    show(seeded(), null)
    await screen.findByRole('region', { name: 'Variable expenses' })

    const card = (label: string) => within(screen.getByRole('region', { name: 'Summary' })).getByText(label).closest('div')!
    expect(card('Left to spend').className.split(' ')).toEqual(expect.arrayContaining(['bg-linear-to-b', 'to-primary-tint']))
    expect(card('Spent').className.split(' ')).toEqual(expect.arrayContaining(['rounded-xl', 'bg-card']))
    const counted = screen.getByRole('region', { name: 'How this period is counted' })
    expect(counted.className.split(' ')).toEqual(expect.arrayContaining(['bg-linear-to-b', 'to-primary-tint']))
    expect(within(counted).getByRole('heading', { level: 2 }).textContent).toBe('How this period is counted')
    expect(screen.getByRole('button', { name: 'Next pay period' }).previousElementSibling?.textContent).toBe('11 – 24 Sep')
    const lists = ['Variable expenses', 'Bills', 'Subscriptions', 'Debts', 'Income', 'Savings'].map((name) => screen.getByRole('region', { name }))
    expect(lists.map((r) => r.className.split(' ').find((c) => c.startsWith('order-')))).toEqual(['order-1', 'order-2', 'order-3', 'order-4', 'order-5', 'order-6'])
    expect(lists.some((r) => r.className.includes('xl:order-'))).toBe(false)
    expect(within(lists[0]!).getByRole('table').className).not.toContain('xl:text-xs')
    await expectNoAxeViolations()
  })

  it('says why Left to spend is taken from nothing when Variable expenses have no budgets, as the Month and Week do', async () => {
    const fake = seeded()
    fake.tables.category_budgets = fake.tables.category_budgets.filter((b) => b.category_id !== 'food')
    show(fake, null)

    expect(await summary('Left to spend')).toBe('-$45.00')
    expect(screen.getByText('No budgets on Variable expenses yet. They are typed on the Month.')).toBeTruthy()
  })

  it('says nothing of missing budgets while one Variable expenses row has a budget, even if another has none', async () => {
    const fake = seeded()
    fake.tables.categories.push(category('fun', 'Fun money', 'variable'))
    show(fake, null)

    expect(await summary('Left to spend')).toBe('$231.92')
    expect(screen.queryByText(/No budgets on Variable expenses/)).toBeNull()
  })

  it('shows the period holding the day asked for, and steps to the paydays either side', async () => {
    show(seeded(), '2026-09-30')

    expect(await cells('Variable expenses', 'Groceries')).toEqual(['276.92', '20.00', '256.92'])
    // 25 September's payday is in September: its amounts are September's.
    expect(await cells('Bills', 'Rent')).toEqual(['738.46planned', '738.46planned', '0.00'])
    expect(screen.getByRole('heading', { name: 'Pay period' })).toBeTruthy()
    expect(screen.getByText('25 Sep – 8 Oct · Day job, paid bi-weekly')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next pay period' }))
    expect(window.location.hash).toBe('#/paycheck/2026-10-09')
    fireEvent.click(screen.getByRole('button', { name: 'Previous pay period' }))
    expect(window.location.hash).toBe('#/paycheck/2026-09-11')
  })

  it('shows the whole monthly amount to someone paid monthly, and a week’s share to someone paid weekly', async () => {
    show(seeded(), null, { ...BIWEEKLY, first_pay_date: '2026-01-15', frequency: 'monthly' })
    expect(await cells('Bills', 'Rent')).toEqual(['1,600.00planned', '1,600.00planned', '0.00'])
    // 15 September to 14 October: the 12th's 45.00 is in the period before.
    expect(await cells('Variable expenses', 'Groceries')).toEqual(['600.00', '20.00', '580.00'])
    expect(screen.getByText('15 Sep – 14 Oct · Day job, paid monthly')).toBeTruthy()
    expect(screen.getByText(/You are paid monthly, so each shows its whole monthly amount\./)).toBeTruthy()
    cleanup()

    // Weekly from Friday 18 September: 1600.00 × 12 ÷ 52 = 369.23; 600.00 → 138.46.
    show(seeded(), null, { ...BIWEEKLY, first_pay_date: '2026-09-18', frequency: 'weekly' })
    expect(await cells('Bills', 'Rent')).toEqual(['369.23planned', '369.23planned', '0.00'])
    expect(await cells('Variable expenses', 'Groceries')).toEqual(['138.46', '', '138.46'])
    expect(screen.getByText(/12 months over 52 paydays: a week’s share\./)).toBeTruthy()
  })

  it('says the pay period, not the month, when its budgets cannot be read (N48)', async () => {
    const fake = seeded()
    fake.fail('category_budgets', '42P01')
    show(fake, null)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Budgets need a one-time update, so this pay period cannot be shown. (code 42P01)',
    )
  })

  it('says which pay period cannot be shown when its monthly amounts cannot be read', async () => {
    const fake = seeded()
    fake.fail('category_plans', 'PGRST205')
    show(fake, null)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Monthly amounts need a one-time update, so this pay period cannot be shown. (code PGRST205)',
    )
    expect(screen.queryByRole('region', { name: 'Summary' })).toBeNull()
  })
})

describe('PaycheckPeriod, a row opened (N48)', () => {
  it("opens the pay period's charges filed under it, named with its dates, each with Move to…", async () => {
    show(seeded(), null)
    const block = within(await screen.findByRole('region', { name: 'Variable expenses' }))
    fireEvent.click(block.getByRole('button', { name: 'Groceries' }))

    const sheet = within(screen.getByRole('dialog', { name: 'Groceries' }))
    expect(sheet.getByText(/^Variable expenses · 11 – 24 Sep ·/)).toBeTruthy()
    // The 12th is in this period; the 25th is the next one's.
    expect(sheet.getAllByRole('button', { name: /^Move to…/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Move to… (NORTHWIND MARKET, 12 Sep 2026)',
    ])
  })

  it('says so when nothing is filed under a bill in the period, whose amount is its share', async () => {
    show(seeded(), null)
    const block = within(await screen.findByRole('region', { name: 'Bills' }))
    fireEvent.click(block.getByRole('button', { name: 'Rent' }))
    expect(within(screen.getByRole('dialog', { name: 'Rent' })).getByText(/^No charges filed here in 11 – 24 Sep\./)).toBeTruthy()
    // e2e-plan-07: $738.46 is the pay period's share, not Rent's $1,600.00 a month.
    expect(within(screen.getByRole('dialog', { name: 'Rent' })).getByText(
      'No charges filed here in 11 – 24 Sep. The amount above is its share of the monthly amount from Lists. A charge filed here counts instead.',
    )).toBeTruthy()
  })

  it('calls the whole monthly amount that, to someone paid monthly', async () => {
    show(seeded(), null, { ...BIWEEKLY, first_pay_date: '2026-01-15', frequency: 'monthly' })
    const block = within(await screen.findByRole('region', { name: 'Bills' }))
    fireEvent.click(block.getByRole('button', { name: 'Rent' }))
    expect(within(screen.getByRole('dialog', { name: 'Rent' })).getByText(/The amount above is its monthly amount from Lists\./)).toBeTruthy()
  })
})
