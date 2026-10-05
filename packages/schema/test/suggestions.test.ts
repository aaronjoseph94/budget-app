import { describe, expect, it } from 'vitest'
import {
  ChangeSchema,
  ListSuggestionsInputSchema,
  ProposeChangeInputSchema,
  ReasonSchema,
  SUGGESTION_KINDS,
  StoredSuggestionSchema,
  SuggestReviewCategoriesInputSchema,
} from '../src/index.js'

// What an AI app may suggest (ADR 0013, PROPOSALS.md §2).
const ID = '11111111-1111-4111-8111-111111111111'
const why = { reason: 'You spent $118.40 a week lately.' }

describe('a suggested change, as an AI app sends it', () => {
  it.each([
    { kind: 'set_budget', category: 'Groceries', amount: '450', ...why },
    { kind: 'set_budget', category: 'Groceries', month: '2026-11', applies: 'only', amount: null, ...why },
    { kind: 'set_weekly_limit', category: 'Groceries', amount: '120.00', ...why },
    { kind: 'set_bill', category: 'Rent', due_day: 3, ...why },
    { kind: 'set_bill', category: 'Rent', from_month: '2026-12', amount: null, ...why },
    { kind: 'set_goal', goal: 'Flight', target: '2,500', ...why },
    { kind: 'set_goal', goal: 'Flight', target_date: null, ...why },
    { kind: 'rename_category', category: 'Eating out', new_name: 'Restaurants', ...why },
    { kind: 'add_category', name: 'Pet care', list: 'variable', ...why },
    { kind: 'move_category', category: 'Gym', to_list: 'transfer', ...why },
    { kind: 'recategorise', transaction: ID, category: 'Household', ...why },
    { kind: 'learn_shop', transaction: ID, category: 'Household', ...why },
  ])('takes $kind', (change) => {
    expect(ChangeSchema.safeParse(change).success).toBe(true)
  })

  it('reads a budget as from this month on, unless only is said', () => {
    expect(ChangeSchema.parse({ kind: 'set_budget', category: 'Groceries', amount: '450', ...why })).toMatchObject({ applies: 'onward' })
  })

  it.each([
    ['no such kind', { kind: 'delete_category', category: 'Gym', ...why }],
    ['a key the kind does not take', { kind: 'set_weekly_limit', category: 'Gym', amount: '5', before: '4', ...why }],
    ['no reason', { kind: 'set_weekly_limit', category: 'Gym', amount: '5' }],
    ['a number for an amount', { kind: 'set_weekly_limit', category: 'Gym', amount: 5, ...why }],
    ['a month with a day', { kind: 'set_budget', category: 'Gym', month: '2026-11-01', amount: '5', ...why }],
    ['month 13', { kind: 'set_budget', category: 'Gym', month: '2026-13', amount: '5', ...why }],
    ['a bill with neither part', { kind: 'set_bill', category: 'Rent', ...why }],
    ['day 32', { kind: 'set_bill', category: 'Rent', due_day: 32, ...why }],
    ['a goal with neither part', { kind: 'set_goal', goal: 'Flight', ...why }],
    ['a new name of 61 characters', { kind: 'rename_category', category: 'Gym', new_name: 'x'.repeat(61), ...why }],
    ['a list that is not one', { kind: 'add_category', name: 'Pets', list: 'misc', ...why }],
    ['a charge that is not an id', { kind: 'recategorise', transaction: 'COSTCO', category: 'Household', ...why }],
  ])('refuses %s', (_, change) => {
    expect(ChangeSchema.safeParse(change).success).toBe(false)
  })

  it('holds a reason to one line of 1–300 visible characters, trimmed', () => {
    expect(ReasonSchema.parse('  Rent rose to $1,550.00. ')).toBe('Rent rose to $1,550.00.')
    for (const bad of ['', '   ', 'x'.repeat(301), 'Two\nlines', `Cof${String.fromCharCode(0x200b)}fee`, `a${String.fromCharCode(0x202e)}b`]) {
      expect(ReasonSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
  })

  it('takes one to twenty changes a call, at most fifty Review categories, and lists by status', () => {
    const one = { kind: 'set_weekly_limit', category: 'Gym', amount: '5', ...why }
    expect(ProposeChangeInputSchema.safeParse({ changes: [] }).success).toBe(false)
    expect(ProposeChangeInputSchema.safeParse({ changes: Array.from({ length: 20 }, () => one) }).success).toBe(true)
    expect(ProposeChangeInputSchema.safeParse({ changes: Array.from({ length: 21 }, () => one) }).success).toBe(false)
    const row = { id: ID, category: 'Groceries' }
    expect(SuggestReviewCategoriesInputSchema.safeParse({ suggestions: Array.from({ length: 50 }, () => row) }).success).toBe(true)
    expect(SuggestReviewCategoriesInputSchema.safeParse({ suggestions: Array.from({ length: 51 }, () => row) }).success).toBe(false)
    expect(ListSuggestionsInputSchema.parse({})).toEqual({ status: 'any', limit: 20 })
    expect(ListSuggestionsInputSchema.safeParse({ status: 'approved' }).success).toBe(false)
  })
})

describe('a suggestion as it is stored', () => {
  const row = {
    id: ID,
    client_id: '99999999-9999-4999-8999-999999999999',
    reason: 'You spent $118.40 a week lately.',
    created_at: '2026-10-05T06:00:00.123456+00:00',
    expires_at: '2026-10-19T06:00:00.123456+00:00',
    status: 'pending',
  }

  it('reads each of the nine kinds, ids and cents as stored', () => {
    expect(SUGGESTION_KINDS).toEqual(['set_budget', 'set_weekly_limit', 'set_bill', 'set_goal', 'rename_category', 'add_category', 'move_category', 'recategorise', 'learn_shop'])
    const parsed = StoredSuggestionSchema.parse({
      ...row,
      kind: 'set_budget',
      target: { category_id: ID, month: '2026-11-01', applies: 'onward' },
      after: { cents: 45000 },
      before: { cents: '40000' },
    })
    expect(parsed).toMatchObject({ kind: 'set_budget', after: { cents: 45000 }, before: { cents: 40000 } })
    expect(
      StoredSuggestionSchema.safeParse({ ...row, kind: 'learn_shop', target: { transaction_id: ID }, after: { category_id: ID }, before: { category_id: ID, rule_category_id: null } })
        .success,
    ).toBe(true)
    expect(StoredSuggestionSchema.safeParse({ ...row, kind: 'add_category', target: { name: 'Pets', list: 'variable' }, after: { name: 'Pets', list: 'variable' }, before: { exists: false } }).success).toBe(true)
  })

  it.each([
    ['an unknown kind', { kind: 'delete_category', target: { category_id: ID }, after: {}, before: {} }],
    ['cents that are not whole', { kind: 'set_weekly_limit', target: { category_id: ID }, after: { cents: 12.5 }, before: { cents: null } }],
    ['a target that is not an id', { kind: 'move_category', target: { category_id: 'Gym' }, after: { list: 'bill' }, before: { list: 'variable' } }],
    ['a month that is not a day', { kind: 'set_bill', target: { category_id: ID, month: '2026-11' }, after: { cents: 1, due_day: 1 }, before: { cents: 1, due_day: 2 } }],
    ['an extra key', { kind: 'rename_category', target: { category_id: ID }, after: { name: 'A', also: 1 }, before: { name: 'B' } }],
  ])('refuses %s, which Review shows as unreadable', (_, rest) => {
    expect(StoredSuggestionSchema.safeParse({ ...row, ...rest }).success).toBe(false)
  })

  it('refuses a reason with a control character, as stored text does', () => {
    const weekly = { kind: 'set_weekly_limit', target: { category_id: ID }, after: { cents: 1 }, before: { cents: null } }
    expect(StoredSuggestionSchema.safeParse({ ...row, ...weekly, reason: 'a\u0007b' }).success).toBe(false)
  })
})
