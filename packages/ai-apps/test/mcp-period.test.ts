import { describe, expect, it } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { callTool, reply } from './fake-database.js'

/**
 * get_period against a fake database (PLAN §2.13, mcp-read-tools). Every
 * figure below is worked by hand from these rows, and core, not mocked,
 * must give it. The owner's today is Wednesday 30 September 2026.
 */
export const READ = {
  today: '2026-09-30',
  categories: [
    { id: 'card', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
    { id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 15000 },
    { id: 'pay', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null },
    { id: 'rent', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null },
  ],
  budgets: [{ id: 'b1', category_id: 'food', month: '2026-09-01', applies: 'onward', budget_cents: 60000 }],
  plans: [{ id: 'p1', category_id: 'rent', effective_month: '2026-01-01', planned_cents: 120000, due_day: 1 }],
  txns: [
    { id: 't6', posted_on: '2026-10-02', amount_cents: -2000, merchant_raw: 'FRESHCO', category_id: 'food', source: 'card_csv' },
    { id: 't4', posted_on: '2026-09-30', amount_cents: 50000, merchant_raw: 'PAYMENT', category_id: 'card', source: 'card_csv' },
    { id: 't3', posted_on: '2026-09-29', amount_cents: -1275, merchant_raw: 'FRESHCO', category_id: 'food', source: 'ai_app' },
    { id: 't2', posted_on: '2026-09-15', amount_cents: 250000, merchant_raw: 'PAYROLL', category_id: 'pay', source: 'typed' },
    { id: 't1', posted_on: '2026-09-02', amount_cents: -4520, merchant_raw: 'FRESHCO', category_id: 'food', source: 'card_csv' },
    { id: 't0', posted_on: '2026-08-31', amount_cents: -999, merchant_raw: 'FRESHCO', category_id: 'food', source: 'card_csv' },
  ],
  balances: [{ month: '2026-09-01', starting_balance_cents: 100000 }],
  schedules: [],
  records: { statement_start: '2026-08-08', statement_end: '2026-09-07', first_entry: '2026-08-31' },
  pending: ['2026-08-31', '2026-09-10', '2026-09-29', '2026-10-01'],
}

const period = (args: Record<string, unknown>, read: unknown = READ) => callTool(() => reply(read), 'get_period', args)
const $ = (cents: number, display: string) => ({ cents, display })

describe('get_period', () => {
  it('gives the month as the Month shows it, reading the months either side', async () => {
    const { result, rpcCalls } = await period({ date: '2026-09-30' })
    expect(JSON.parse(String(rpcCalls[0]?.init.body))).toEqual({
      p_parts: ['categories', 'budgets', 'plans', 'txns', 'balances', 'schedules', 'records', 'pending'],
      p_from: '2026-08-01',
      p_to: '2026-10-31',
    })
    const out = result.structuredContent as Record<string, unknown>
    expect(out.period).toEqual({ kind: 'month', from: '2026-09-01', to: '2026-09-30', days_left: 1 })
    // Spent: groceries 45.20 + 12.75, and the rent planned for the 1st, 1,200.00. End: 1,000 + 2,500 − 1,257.95.
    expect(out.summary).toEqual({
      starting_balance: $(100000, '$1,000.00'),
      income: $(250000, '$2,500.00'),
      spent: $(125795, '$1,257.95'),
      saved: $(0, '$0.00'),
      left_to_spend: $(54205, '$542.05'),
      ending_balance: $(224205, '$2,242.05'),
      card_payments_left_out: $(50000, '$500.00'),
    })
    const lists = out.lists as { list: string }[]
    expect(lists.map((l) => l.list)).toEqual(['income', 'savings', 'variable', 'bill', 'debt', 'subscription'])
    // 57.95 of 600.00 is 9.66 %, half-up; the rent's planned amount stands as its budget (F51).
    expect(lists[2]).toEqual({ list: 'variable', budget: $(60000, '$600.00'), actual: $(5795, '$57.95'), used_bp: 966, left: $(54205, '$542.05') })
    expect(lists[3]).toEqual({ list: 'bill', budget: $(120000, '$1,200.00'), actual: $(120000, '$1,200.00'), used_bp: 10000, left: null })
    expect(lists[1]).toEqual({ list: 'savings', budget: null, actual: $(0, '$0.00'), used_bp: null, left: null })
    // Day 30 of 30: the pace is the Actual itself, under the budget.
    expect(out.categories).toEqual([
      { name: 'Pay', list: 'income', budget: null, actual: $(250000, '$2,500.00'), left: null, standing: null },
      { name: 'Groceries', list: 'variable', budget: $(60000, '$600.00'), actual: $(5795, '$57.95'), left: $(54205, '$542.05'),
        standing: 'under', pace: { pace: $(5795, '$57.95'), over: null } },
      { name: 'Rent', list: 'bill', budget: $(120000, '$1,200.00'), actual: $(120000, '$1,200.00'), left: $(0, '$0.00'), standing: 'near' },
    ])
    // Waiting: 10 and 29 September; not 31 August or 1 October.
    expect([out.as_of, out.imported_through, out.waiting_in_review]).toEqual(['2026-09-30', '2026-09-07', 2])
  })

  it('has no days left or paces in another month, and names only the categories asked for', async () => {
    const august = (await period({ date: '2026-08-15', categories: ['Groceries'] })).result.structuredContent as Record<string, unknown>
    expect(august.period).toEqual({ kind: 'month', from: '2026-08-01', to: '2026-08-31', days_left: null })
    // August's 9.99, with no budget typed before September: Left is 0 − 9.99, as Jan!V22 reads a blank budget.
    expect(august.categories).toEqual([
      { name: 'Groceries', list: 'variable', budget: null, actual: $(999, '$9.99'), left: $(-999, '-$9.99'), standing: 'none' },
    ])
    expect(august.waiting_in_review).toBe(1)
  })

  it('gives this week from Monday 28 September to Sunday 4 October, with its days left', async () => {
    const { result, rpcCalls } = await period({ period: 'week', list: 'variable' })
    expect(JSON.parse(String(rpcCalls[0]?.init.body)).p_parts).toEqual(['categories', 'plans', 'txns', 'records', 'pending'])
    const out = result.structuredContent as Record<string, unknown>
    // Wednesday to Sunday, today counted.
    expect(out.period).toEqual({ kind: 'week', from: '2026-09-28', to: '2026-10-04', days_left: 5 })
    // 12.75 and 20.00 against the weekly 150.00 (21.83 %); October's 1,200.00 rent falls on the 1st.
    expect(out.lists).toEqual([{ list: 'variable', budget: $(15000, '$150.00'), actual: $(3275, '$32.75'), used_bp: 2183, left: $(11725, '$117.25') }])
    expect((out.summary as Record<string, unknown>).spent).toEqual($(123275, '$1,232.75'))
    // No start is typed for a week, so no end either (D17).
    expect((out.summary as Record<string, unknown>).ending_balance).toBeNull()
    expect(out.categories).toEqual([
      { name: 'Groceries', list: 'variable', budget: $(15000, '$150.00'), actual: $(3275, '$32.75'), left: $(11725, '$117.25'), standing: 'under' },
    ])
    expect(out.waiting_in_review).toBe(2)
  })

  it('has no days left in another week', async () => {
    const week = (await period({ period: 'week', date: '2026-09-10', categories: ['Rent'] })).result.structuredContent as Record<string, unknown>
    expect(week.period).toEqual({ kind: 'week', from: '2026-09-07', to: '2026-09-13', days_left: null })
    expect(week.categories).toEqual([{ name: 'Rent', list: 'bill', budget: null, actual: $(0, '$0.00'), left: null, standing: 'none' }])
  })

  it.each([
    ['a category it does not have', { categories: ['Nope'] }, READ, SENTENCES.unknown_category],
    ['rows it cannot read', {}, { ...READ, txns: 'SECRET' }, SENTENCES.records_unreadable],
    ['a charge on a category it was not given', {}, { ...READ, categories: [] }, SENTENCES.records_unreadable],
    ['a refusal', {}, { refused: 'limit_reached' }, SENTENCES.limit_reached],
  ])('answers %s with one sentence', async (_, args, read, sentence) => {
    const { result } = await period(args, read)
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: sentence }] })
  })
})
