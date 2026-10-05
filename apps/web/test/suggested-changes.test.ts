import { describe, expect, it } from 'vitest'
import { createFakeSupabase, type FakeTables } from './fake-supabase.js'
import { currentOf, listWaiting, readSources, stateOf, type Now } from '../src/review/suggested-changes.js'
import { StoredSuggestionSchema, type StoredSuggestion } from '@budget/schema'

/**
 * Review's Suggested changes, read (ADR 0013): the waiting rows parsed as
 * an AI app's output at rest, and each card's "from" worked out fresh, as
 * the screens work it out, never taken from the stored before.
 */
const FOOD = '11111111-1111-4111-8111-111111111111'
const RENT = '22222222-2222-4222-8222-222222222222'
const GOAL = '33333333-3333-4333-8333-333333333333'
const TXN = '44444444-4444-4444-8444-444444444444'
const APP = '99999999-9999-4999-8999-999999999999'
let n = 0
const row = (kind: string, target: object, after: object, before: object, over: Record<string, unknown> = {}) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  status: 'pending',
  kind,
  client_id: APP,
  target,
  after,
  before,
  reason: 'You spent $118.40 a week lately.',
  created_at: `2026-10-05T06:00:${String(n % 60).padStart(2, '0')}+00:00`,
  expires_at: '2999-01-01T00:00:00+00:00',
  ...over,
})

const seed = (): Partial<FakeTables> => ({
  categories: [
    { id: FOOD, name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 10000 },
    { id: RENT, name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null },
  ],
  category_budgets: [{ id: 'b1', category_id: FOOD, month: '2026-08-01', applies: 'onward', budget_cents: 40000 }],
  category_plans: [{ id: 'p1', category_id: RENT, effective_month: '2026-01-01', planned_cents: 150000, due_day: 1 }],
  savings_goals: [{ id: GOAL, name: 'Flight', target_cents: 200000, saved_cents: 0, target_date: '2027-03-01', unit_cost_cents: null, unit_label: null }],
  transactions: [{ id: TXN, posted_on: '2026-09-03', amount_cents: -5420, merchant_raw: 'COSTCO #12', category_id: FOOD, source: 'card_csv' }],
  merchant_rules: [{ match_merchant: 'COSTCO', category_id: FOOD }],
})

async function read(rows: Record<string, unknown>[]) {
  const fake = createFakeSupabase({ ...seed(), ai_app_proposals: rows })
  fake.tables.transactions = fake.tables.transactions.map((t) => ({ ...t, merchant: 'COSTCO' }))
  const waiting = await listWaiting(fake.client)
  const parsed = waiting.flatMap((w) => (w.suggestion === null ? [] : [w.suggestion]))
  const sources = await readSources(fake.client, fake.tables.categories, parsed)
  return { fake, waiting, now: (s: StoredSuggestion) => currentOf(s, sources) }
}

describe('the suggestions waiting', () => {
  it('are the pending ones in their days, oldest first, each parsed or marked unreadable', async () => {
    const { waiting } = await read([
      row('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 10000 }),
      row('set_weekly_limit', { category_id: FOOD }, { cents: 'twelve' }, { cents: 10000 }),
      row('set_weekly_limit', { category_id: FOOD }, { cents: 1 }, { cents: 10000 }, { status: 'dismissed' }),
      row('set_weekly_limit', { category_id: FOOD }, { cents: 1 }, { cents: 10000 }, { expires_at: '2020-01-01T00:00:00+00:00' }),
    ])
    expect(waiting.map((w) => [w.clientId, w.suggestion?.kind ?? null])).toEqual([
      [APP, 'set_weekly_limit'],
      [APP, null],
    ])
  })

  it('are none before 0039 is in', async () => {
    const fake = createFakeSupabase()
    fake.fail('ai_app_proposals', 'PGRST205')
    expect(await listWaiting(fake.client)).toEqual([])
    fake.fail('ai_app_proposals', 'PGRST301')
    await expect(listWaiting(fake.client)).rejects.toThrow()
  })
})

describe('what each target is now', () => {
  it('works budgets and monthly amounts out with core, and reads the rest as stored', async () => {
    const { waiting, now } = await read([
      row('set_budget', { category_id: FOOD, month: '2026-11-01', applies: 'onward' }, { cents: 45000 }, { cents: 40000 }),
      row('set_bill', { category_id: RENT, month: '2026-11-01' }, { cents: 155000, due_day: 3 }, { cents: 150000, due_day: 1 }),
      row('set_goal', { goal_id: GOAL }, { target_cents: 250000, target_date: '2027-03-01' }, { target_cents: 200000, target_date: '2027-03-01' }),
      row('rename_category', { category_id: RENT }, { name: 'Housing' }, { name: 'Rent' }),
      row('move_category', { category_id: FOOD }, { list: 'bill' }, { list: 'variable' }),
      row('add_category', { name: 'Rent', list: 'bill' }, { name: 'Rent', list: 'bill' }, { exists: false }),
      row('learn_shop', { transaction_id: TXN }, { category_id: RENT }, { category_id: FOOD, rule_category_id: FOOD }),
    ])
    const values = waiting.map((w) => (w.suggestion === null ? null : now(w.suggestion)))
    expect(values).toEqual([
      { value: { cents: 40000 } },
      { value: { cents: 150000, due_day: 1 } },
      { value: { target_cents: 200000, target_date: '2027-03-01' } },
      { value: { name: 'Rent' } },
      { value: { list: 'variable' } },
      { value: { name: 'Rent', list: 'bill' } },
      { value: { category_id: FOOD, rule_category_id: FOOD } },
    ])
    expect(waiting.map((w, i) => stateOf(w.suggestion, values[i] ?? null))).toEqual(['ready', 'ready', 'ready', 'ready', 'ready', 'already', 'ready'])
  })

  it('finds a target gone, and a charge or category it cannot see, as gone', async () => {
    const { waiting, now } = await read([
      row('recategorise', { transaction_id: '55555555-5555-4555-8555-555555555555' }, { category_id: RENT }, { category_id: FOOD }),
      row('set_weekly_limit', { category_id: '66666666-6666-4666-8666-666666666666' }, { cents: 1 }, { cents: null }),
    ])
    expect(waiting.map((w) => (w.suggestion === null ? null : now(w.suggestion)))).toEqual([{ gone: true }, { gone: true }])
  })
})

describe('a card’s state', () => {
  const s = StoredSuggestionSchema.parse(row('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 10000 }))
  const at = (cents: number | null): Now => ({ value: { cents } })
  it.each([
    [at(10000), 'ready'],
    [at(12000), 'already'],
    [at(11000), 'stale'],
    [at(null), 'stale'],
    [{ gone: true } as Now, 'stale'],
  ])('is %j → %s', (now, state) => {
    expect(stateOf(s, now)).toBe(state)
    expect(stateOf(null, now)).toBe('unreadable')
  })
})
