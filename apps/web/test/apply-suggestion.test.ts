import { describe, expect, it } from 'vitest'
import { StoredSuggestionSchema } from '@budget/schema'
import { applySuggestion, dismissSuggestion } from '../src/review/apply-suggestion.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * Apply and Dismiss (ADR 0013): read again, check, the owning screen's
 * own write, then the mark. A target that moved is stale and nothing is
 * written; one already so is left for Clear; a refused write leaves the
 * suggestion waiting, in the screen's words.
 */
const FOOD = '11111111-1111-4111-8111-111111111111'
const RENT = '22222222-2222-4222-8222-222222222222'
const GOAL = '33333333-3333-4333-8333-333333333333'
const TXN = '44444444-4444-4444-8444-444444444444'
const ID = '55555555-5555-4555-8555-555555555555'

function setup(kind: string, target: object, after: object, before: object) {
  const row = { id: ID, status: 'pending', kind, client_id: ID, target, after, before, reason: 'Because.', created_at: '2026-10-05T06:00:00+00:00', expires_at: '2999-01-01T00:00:00+00:00' }
  const fake = createFakeSupabase({
    categories: [
      { id: FOOD, name: 'Groceries', kind: 'variable', sort_order: 3, weekly_budget_cents: 10000 },
      { id: RENT, name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null },
    ],
    category_budgets: [
      { id: 'b1', category_id: FOOD, month: '2026-08-01', applies: 'onward', budget_cents: 40000 },
      { id: 'b2', category_id: FOOD, month: '2026-11-01', applies: 'only', budget_cents: 40000, user_id: 'u1' },
    ],
    category_plans: [{ id: 'p1', category_id: RENT, effective_month: '2026-01-01', planned_cents: 150000, due_day: 1 }],
    savings_goals: [{ id: GOAL, name: 'Flight', target_cents: 200000, saved_cents: 5000, target_date: '2027-03-01', unit_cost_cents: null, unit_label: null, start_date: '2026-01-01' }],
    transactions: [{ id: TXN, posted_on: '2026-09-03', amount_cents: -5420, merchant_raw: 'COSTCO #12', category_id: FOOD, source: 'card_csv' }],
    ai_app_proposals: [row],
  })
  return { fake, s: StoredSuggestionSchema.parse(row), apply: () => applySuggestion(fake.client, 'u1', StoredSuggestionSchema.parse(row), '2026-10-05') }
}
const marked = (fake: ReturnType<typeof setup>['fake']) => fake.tables.ai_app_proposals.map((r) => r['status'])

describe('Apply', () => {
  it('makes a budget from a month on as the Month does, its own "just this month" value too, then marks it', async () => {
    const { fake, apply } = setup('set_budget', { category_id: FOOD, month: '2026-11-01', applies: 'onward' }, { cents: 45000 }, { cents: 40000 })
    expect(await apply()).toBe('applied')
    expect(fake.tables.category_budgets.filter((b) => b.month === '2026-11-01').map((b) => [b.applies, b.budget_cents])).toEqual([
      ['only', 45000],
      ['onward', 45000],
    ])
    expect(marked(fake)).toEqual(['applied'])
    expect(fake.rpcCalls.at(-1)).toEqual({ name: 'decide_suggestion', args: { p_id: ID, p_outcome: 'applied' } })
  })

  it.each([
    ['a weekly limit', 'set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 10000 }],
    ['a bill', 'set_bill', { category_id: RENT, month: '2026-11-01' }, { cents: 155000, due_day: 3 }, { cents: 150000, due_day: 1 }],
    ['a goal', 'set_goal', { goal_id: GOAL }, { target_cents: 250000, target_date: null }, { target_cents: 200000, target_date: '2027-03-01' }],
    ['a rename', 'rename_category', { category_id: RENT }, { name: 'Housing' }, { name: 'Rent' }],
    ['a new category', 'add_category', { name: 'Pets', list: 'variable' }, { name: 'Pets', list: 'variable' }, { exists: false }],
    ['a move', 'move_category', { category_id: FOOD }, { list: 'subscription' }, { list: 'variable' }],
  ])('makes %s with the owning screen’s write', async (_, kind, target, after, before) => {
    const { fake, apply } = setup(kind, target, after, before)
    expect(await apply()).toBe('applied')
    const t = fake.tables
    const done = {
      set_weekly_limit: () => t.categories.find((c) => c.id === FOOD)?.weekly_budget_cents === 12000,
      set_bill: () => t.category_plans.some((p) => p.effective_month === '2026-11-01' && p.planned_cents === 155000 && p.due_day === 3),
      // The typed balance stays as typed: only the goal and its date change.
      set_goal: () => t.savings_goals[0]?.target_cents === 250000 && t.savings_goals[0]?.target_date === null && t.savings_goals[0]?.saved_cents === 5000,
      rename_category: () => t.categories.find((c) => c.id === RENT)?.name === 'Housing',
      add_category: () => t.categories.some((c) => c.name === 'Pets' && c.kind === 'variable' && c.sort_order === 4),
      move_category: () => t.categories.some((c) => c.id === FOOD && c.kind === 'subscription' && c.sort_order === 0),
    }[kind]
    expect(done?.()).toBe(true)
    expect(marked(fake)).toEqual(['applied'])
  })

  it.each([
    ['moves a charge with Always file off', 'recategorise', false],
    ['learns a shop with Always file on', 'learn_shop', true],
  ])('%s', async (_, kind, learn) => {
    const before = kind === 'learn_shop' ? { category_id: FOOD, rule_category_id: null } : { category_id: FOOD }
    const { fake, apply } = setup(kind, { transaction_id: TXN }, { category_id: RENT }, before)
    expect(await apply()).toBe('applied')
    expect(fake.rpcCalls.find((c) => c.name === 'recategorise_transaction')?.args).toEqual({ p_transaction: TXN, p_category: RENT, p_learn: learn })
  })

  it('writes nothing for a month gone by, or a category now on a list the screens give no such value', async () => {
    const past = setup('set_bill', { category_id: RENT, month: '2026-09-01' }, { cents: 155000, due_day: 3 }, { cents: 150000, due_day: 1 })
    expect(await past.apply()).toBe('stale')
    const moved = setup('set_bill', { category_id: FOOD, month: '2026-11-01' }, { cents: 5000, due_day: null }, { cents: null, due_day: null })
    expect(await moved.apply()).toBe('stale')
    for (const { fake } of [past, moved]) {
      expect(fake.tables.category_plans).toHaveLength(1)
      expect(marked(fake)).toEqual(['pending'])
    }
  })

  it('writes nothing for a target changed since, or already so, and leaves it waiting', async () => {
    const stale = setup('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 9000 })
    expect(await stale.apply()).toBe('stale')
    const already = setup('set_weekly_limit', { category_id: FOOD }, { cents: 10000 }, { cents: 9000 })
    expect(await already.apply()).toBe('already')
    for (const { fake } of [stale, already]) {
      expect(fake.tables.categories.find((c) => c.id === FOOD)?.weekly_budget_cents).toBe(10000)
      expect(marked(fake)).toEqual(['pending'])
    }
  })

  it.each([
    ['dismissed on another device', { status: 'dismissed' }],
    ['replaced by the AI app', { status: 'replaced' }],
    ['past its day while Review stayed open', { expires_at: '2020-01-01T00:00:00+00:00' }],
  ])('writes nothing for one %s, and says it no longer waits', async (_, now) => {
    const { fake, apply } = setup('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 10000 })
    fake.tables.ai_app_proposals[0] = { ...fake.tables.ai_app_proposals[0], ...now }
    expect(await apply()).toBe('gone')
    expect(fake.tables.categories.find((c) => c.id === FOOD)?.weekly_budget_cents).toBe(10000)
    expect(fake.rpcCalls.some((c) => c.name === 'decide_suggestion')).toBe(false)
  })

  it('writes nothing when the waiting row is not what the card read', async () => {
    const { fake, s } = setup('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 10000 })
    fake.tables.ai_app_proposals[0] = { ...fake.tables.ai_app_proposals[0], after: { cents: 99000 } }
    expect(await applySuggestion(fake.client, 'u1', s, '2026-10-05')).toBe('gone')
    expect(fake.tables.categories.find((c) => c.id === FOOD)?.weekly_budget_cents).toBe(10000)
  })

  it('says so when the change was made but the suggestion stopped waiting just before its mark', async () => {
    const { fake, apply } = setup('set_bill', { category_id: RENT, month: '2026-11-01' }, { cents: 155000, due_day: 3 }, { cents: 150000, due_day: 1 })
    // Dismissed elsewhere between the write and the mark.
    fake.server.hold = (what) => {
      if (what === 'POST category_plans') fake.tables.ai_app_proposals[0] = { ...fake.tables.ai_app_proposals[0], status: 'dismissed' }
      return null
    }
    expect(await apply()).toBe('applied_unmarked')
    expect(fake.tables.category_plans.some((p) => p.effective_month === '2026-11-01' && p.planned_cents === 155000)).toBe(true)
    expect(marked(fake)).toEqual(['dismissed'])
  })

  // skills-05: a mark refused after a good write threw "nothing was saved".
  it('says the change was made when its mark is refused after the write', async () => {
    const { fake, apply } = setup('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 10000 })
    fake.fail('rpc/decide_suggestion', 'PGRST301')
    expect(await apply()).toBe('applied_mark_failed')
    expect(fake.tables.categories.find((c) => c.id === FOOD)?.weekly_budget_cents).toBe(12000)
    expect(marked(fake)).toEqual(['pending'])
  })

  it('leaves it waiting when the write is refused, in the screen’s own words', async () => {
    const { fake, apply } = setup('set_bill', { category_id: RENT, month: '2026-11-01' }, { cents: 155000, due_day: 3 }, { cents: 150000, due_day: 1 })
    fake.fail('POST category_plans', '23514')
    await expect(apply()).rejects.toThrow(/./)
    expect(marked(fake)).toEqual(['pending'])
    expect(fake.rpcCalls.some((c) => c.name === 'decide_suggestion')).toBe(false)
  })
})

describe('Dismiss', () => {
  it('marks it dismissed, once, and changes nothing else', async () => {
    const { fake, s } = setup('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 10000 })
    expect(await dismissSuggestion(fake.client, s.id)).toBe(true)
    expect(await dismissSuggestion(fake.client, s.id)).toBe(false)
    expect(marked(fake)).toEqual(['dismissed'])
    expect(fake.tables.categories.find((c) => c.id === FOOD)?.weekly_budget_cents).toBe(10000)
  })
})
