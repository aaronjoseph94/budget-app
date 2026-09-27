import { describe, expect, it } from 'vitest'
import { answerOf, readDebts } from '../src/ask/answer.js'
import type { DigestRows } from '../src/coach/facts.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/** Ask's answer, apart from any screen (plan A24): the Coach's year read, renamed for core. Invented data. */
const CATEGORIES: readonly Category[] = [
  { id: 'c-dining', name: 'Dining out', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
  { id: 'c-fund', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null },
]
const row = (id: string, posted_on: string, amount_cents: number, category_id = 'c-dining') => ({ id, posted_on, amount_cents, merchant_raw: 'BISTRO 0412', category_id, source: 'card_pdf' })
const READ: DigestRows = {
  asOf: '2026-09-24',
  readFrom: '2025-09-01',
  rows: [row('t1', '2026-08-03', -4_000), row('t2', '2026-08-19', -2_540), row('t3', '2026-09-02', -1_200), row('t4', '2026-08-15', -30_000, 'c-fund')],
  budgets: [],
  plans: [],
  statementEnds: ['2026-09-20'],
  records: { statementStarts: ['2026-08-01'], entryDates: [] },
  pending: null,
  forecast: { status: 'failed', missingUpdate: true },
}
const inputs = { read: READ, categories: CATEGORIES, goals: [], debts: null, notSubscriptions: [] }

describe('answerOf', () => {
  it('answers from the rows read, with each row’s shop as core groups it', () => {
    expect(answerOf(inputs, { intent: 'spend_in', period: { kind: 'last_month' }, categoryIds: ['c-dining'], monthlyCents: null })).toMatchObject({
      status: 'answered',
      now: { from: '2026-08-01', to: '2026-08-31' },
      main: { say: 'spent_in', names: ['Dining out'], figures: { amount: { unit: 'cents', value: 6_540 } } },
    })
    expect(answerOf(inputs, { intent: 'top_shops', period: { kind: 'last_month' }, categoryIds: [], monthlyCents: null })).toMatchObject({
      main: { say: 'top_shops', names: ['BISTRO'] },
    })
  })

  it('knows where the records start, and that the forecast’s reads did not load', () => {
    expect(answerOf(inputs, { intent: 'spend_in', period: { kind: 'month', month: 7, yearsBack: 0 }, categoryIds: [], monthlyCents: null })).toEqual({
      status: 'before_records',
      coveredFrom: '2026-08-01',
    })
    expect(answerOf(inputs, { intent: 'forecast', period: null, categoryIds: [], monthlyCents: null })).toEqual({ status: 'missing', what: 'forecast' })
  })
})

describe('readDebts', () => {
  it('reads the payoff plan, or says an update is missing', async () => {
    const fake = createFakeSupabase()
    expect(await readDebts(fake.client)).toEqual({ debts: [], extraPayments: [] })
    fake.fail('debts', '42P01')
    expect(await readDebts(fake.client)).toBe('missing_update')
  })
})
