import { describe, expect, it } from 'vitest'
import { StoredSuggestionSchema } from '@budget/schema'
import { cardWords, valueWords, type Words } from '../src/review/change-words.js'
import type { Sources } from '../src/review/suggested-changes.js'

/**
 * A suggested change in the owner's words (PROPOSALS.md §2): money by the
 * one display helper, months and days by format.ts, and every name or
 * shop kept as data for the card to draw as ingested text.
 */
const FOOD = '11111111-1111-4111-8111-111111111111'
const PAY = '22222222-2222-4222-8222-222222222222'
const FUND = '33333333-3333-4333-8333-333333333333'
const GOAL = '44444444-4444-4444-8444-444444444444'
const TXN = '55555555-5555-4555-8555-555555555555'
const SOURCES: Sources = {
  categories: [
    { id: FOOD, name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 10000 },
    { id: PAY, name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null },
    { id: FUND, name: 'Trip fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null },
  ],
  budgets: [],
  plans: [],
  funds: [{ id: GOAL, name: 'Flight', target_cents: 200000, saved_cents: 0, target_date: '2027-03-01', unit_cost_cents: null, unit_label: null, category_id: FUND, start_date: null, balance_as_of: '2026-09-01' }],
  charges: [{ id: TXN, posted_on: '2026-09-03', amount_cents: -5420, merchant_raw: 'COSTCO WHOLESALE', merchant: 'COSTCO WHOLESALE', category_id: FOOD, source: 'card_csv' }],
  rules: new Map(),
}
const suggestion = (kind: string, target: object, after: object, before: object) =>
  StoredSuggestionSchema.parse({
    id: '66666666-6666-4666-8666-666666666666',
    client_id: '99999999-9999-4999-8999-999999999999',
    reason: 'Because.',
    created_at: '2026-10-05T06:00:00+00:00',
    expires_at: '2026-10-19T06:00:00+00:00',
    kind,
    target,
    after,
    before,
  })
/** Words as one line, with data marked, to read a card at a glance. */
const line = (words: Words | null | undefined) => (words ?? []).map((w) => (typeof w === 'string' ? w : `[${w.data}]`)).join('')
const read = (s: ReturnType<typeof suggestion>) => {
  const w = cardWords(s, SOURCES)
  return [line(w.title), w.change === null ? null : `${line(w.change.from)} → ${line(w.change.to)}`, w.note]
}

describe('a budget on Bills, Debts or Subscriptions', () => {
  const RENT = '77777777-7777-4777-8777-777777777777'
  const sources = (plans: Sources['plans']): Sources => ({
    ...SOURCES,
    categories: [...SOURCES.categories, { id: RENT, name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null }],
    plans,
  })
  const clear = suggestion('set_budget', { category_id: RENT, month: '2026-11-01', applies: 'onward' }, { cents: null }, { cents: 160000 })

  it('says no budget is its monthly amount standing, as the Month marks it', () => {
    const w = cardWords(clear, sources([{ id: 'p1', category_id: RENT, effective_month: '2026-01-01', planned_cents: 150000, due_day: 1 }]))
    expect(`${line(w.change?.from)} → ${line(w.change?.to)}`).toBe('$1,600.00 → $1,500.00 planned')
  })

  it('says no budget where no monthly amount is in effect', () => {
    const w = cardWords(clear, sources([{ id: 'p1', category_id: RENT, effective_month: '2026-01-01', planned_cents: null, due_day: null }]))
    expect(line(w.change?.to)).toBe('no budget')
  })
})

describe('a suggested change, in words', () => {
  it.each([
    [
      suggestion('set_budget', { category_id: FOOD, month: '2026-11-01', applies: 'onward' }, { cents: 45000 }, { cents: 40000 }),
      ['[Groceries] budget from November 2026 on', '$400.00 → $450.00', 'And every later month without its own budget.'],
    ],
    [
      suggestion('set_budget', { category_id: PAY, month: '2026-11-01', applies: 'only' }, { cents: null }, { cents: 300000 }),
      ['[Pay] goal for November 2026 only', '$3,000.00 → no goal', null],
    ],
    [suggestion('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: null }), ['[Groceries] weekly budget', 'no budget → $120.00', null]],
    [
      suggestion('set_bill', { category_id: FOOD, month: '2026-11-01' }, { cents: 155000, due_day: 3 }, { cents: null, due_day: 1 }),
      ['[Groceries] from November 2026 on', 'stopped on day 1 → $1,550.00 on day 3', null],
    ],
    [
      suggestion('set_goal', { goal_id: GOAL }, { target_cents: 250000, target_date: null }, { target_cents: 200000, target_date: '2027-03-01' }),
      ['[Flight] savings goal', '$2,000.00, by 1 Mar 2027 → $2,500.00, no date', null],
    ],
    [
      suggestion('rename_category', { category_id: FOOD }, { name: 'Food' }, { name: 'Groceries' }),
      ['Rename a category', '[Groceries] → [Food]', 'Its charges, budgets and learned shops follow.'],
    ],
    [suggestion('add_category', { name: 'Pet care', list: 'variable' }, { name: 'Pet care', list: 'variable' }, { exists: false }), ['Add [Pet care] to Variable expenses', null, null]],
    [suggestion('move_category', { category_id: FOOD }, { list: 'transfer' }, { list: 'variable' }), ['Move [Groceries]', 'Variable expenses → Not spending', 'Its charges stop counting as spending.']],
    [suggestion('move_category', { category_id: FOOD }, { list: 'variable' }, { list: 'transfer' }), ['Move [Groceries]', 'Not spending → Variable expenses', 'Its charges start counting as spending.']],
    [suggestion('move_category', { category_id: FUND }, { list: 'variable' }, { list: 'savings' }), ['Move [Trip fund]', 'Savings → Variable expenses', 'Its savings goal will be on no fund.']],
    [suggestion('recategorise', { transaction_id: TXN }, { category_id: PAY }, { category_id: FOOD }), ['[COSTCO WHOLESALE], 3 Sep 2026, -$54.20', '[Groceries] → [Pay]', null]],
    [
      suggestion('learn_shop', { transaction_id: TXN }, { category_id: PAY }, { category_id: FOOD, rule_category_id: null }),
      ['Always file [COSTCO WHOLESALE] under [Pay]', 'under [Groceries] (filed by hand) → under [Pay] (always)', 'From now on its statement lines skip Review. This charge moves too.'],
    ],
  ])('%#: %j', (s, words) => {
    expect(read(s)).toEqual(words)
  })

  it('says what a removed category, goal or charge was not', () => {
    const gone = '77777777-7777-4777-8777-777777777777'
    expect(read(suggestion('recategorise', { transaction_id: gone }, { category_id: gone }, { category_id: FOOD }))).toEqual(['a removed charge', '[Groceries] → a removed category', null])
    expect(read(suggestion('set_goal', { goal_id: gone }, { target_cents: 1, target_date: null }, { target_cents: 2, target_date: null }))[0]).toBe('A removed goal savings goal')
  })

  it('says a value as it is now: a learned shop, a list, a category already there', () => {
    const learn = suggestion('learn_shop', { transaction_id: TXN }, { category_id: PAY }, { category_id: FOOD, rule_category_id: null })
    expect(line(valueWords(learn, { category_id: FOOD, rule_category_id: FOOD }, SOURCES))).toBe('under [Groceries] (always filed under [Groceries])')
    const move = suggestion('move_category', { category_id: FOOD }, { list: 'bill' }, { list: 'variable' })
    expect(line(valueWords(move, { list: 'debt' }, SOURCES))).toBe('Debts')
    const add = suggestion('add_category', { name: 'Pet care', list: 'variable' }, { name: 'Pet care', list: 'variable' }, { exists: false })
    expect(line(valueWords(add, { name: 'Pet care', list: 'bill' }, SOURCES))).toBe('[Pet care] on Bills')
  })
})
