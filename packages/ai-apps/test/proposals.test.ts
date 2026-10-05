import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { ChangeSchema } from '@budget/schema'
import { CHANGE_SENTENCES, ownerOf, prepare, type Owner } from '../src/proposals.js'

/**
 * Budget, weekly limit, bill and goal changes, from what an AI app sends
 * to what ai_app_propose stores (PROPOSALS.md §2): names to ids, months
 * and amounts read, and the two befores only the engine can say worked
 * out by core, as the Month and Setup show them.
 */
const OWNER: Owner = ownerOf({
  today: '2026-10-05',
  categories: [
    { id: 'c-food', name: 'Groceries\u200b', kind: 'variable', sort_order: 0, weekly_budget_cents: 10000 },
    { id: 'c-rent', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null },
  ],
  budgets: [
    { id: 'b1', category_id: 'c-food', month: '2026-08-01', applies: 'onward', budget_cents: '40000' },
    { id: 'b2', category_id: 'c-food', month: '2026-11-01', applies: 'only', budget_cents: 42000 },
  ],
  plans: [{ id: 'p1', category_id: 'c-rent', effective_month: '2026-01-01', planned_cents: 150000, due_day: 1 }],
  goals: [
    { id: 'g-trip', name: 'Flight', target_cents: 200000, saved_cents: 0, target_date: '2027-03-01', unit_cost_cents: null, unit_label: null, created_at: '2026-01-01', sort_order: 0, status: 'active', reached_on: null, category_id: null, start_date: null, balance_as_of: null },
  ],
})
const why = { reason: 'You spent $118.40 a week lately.' }
const change = (c: Record<string, unknown>) => prepare(OWNER, ChangeSchema.parse({ ...why, ...c }))

describe('a budget change', () => {
  it('names the category by id, from this month on unless asked, with the budget in effect that month as before', () => {
    expect(change({ kind: 'set_budget', category: 'Groceries', amount: '450' })).toEqual({
      item: { kind: 'set_budget', category: 'c-food', month: '2026-10-01', applies: 'onward', amount: 45000, before: { cents: 40000 }, ...why },
    })
    // November has its own "just this month" budget, which is what is in effect there (D12).
    expect(change({ kind: 'set_budget', category: 'Groceries', month: '2026-11', applies: 'only', amount: null })).toMatchObject({
      item: { month: '2026-11-01', applies: 'only', amount: null, before: { cents: 42000 } },
    })
  })

  it('refuses a budget where a monthly amount stands as one, and takes one where a budget is typed or no amount is set', () => {
    // Rent has $1,500.00 a month from January and no budget: the Month shows "1,500.00 planned" (F51).
    expect(change({ kind: 'set_budget', category: 'Rent', amount: '1,550' })).toEqual({ refused: 'planned_stands' })
    expect(change({ kind: 'set_budget', category: 'Rent', amount: null })).toEqual({ refused: 'planned_stands' })
    const typed = ownerOf({
      today: '2026-10-05',
      categories: [{ id: 'c-rent', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null }],
      budgets: [{ id: 'b1', category_id: 'c-rent', month: '2026-01-01', applies: 'onward', budget_cents: 160000 }],
      plans: [{ id: 'p1', category_id: 'c-rent', effective_month: '2026-01-01', planned_cents: 150000, due_day: 1 }],
      goals: [],
    })
    expect(prepare(typed, ChangeSchema.parse({ ...why, kind: 'set_budget', category: 'Rent', amount: null }))).toMatchObject({ item: { amount: null, before: { cents: 160000 } } })
    const none = { ...typed, budgets: [], plans: [] }
    expect(prepare(none, ChangeSchema.parse({ ...why, kind: 'set_budget', category: 'Rent', amount: '5' }))).toMatchObject({ item: { before: { cents: null } } })
  })

  it('says, from a month on, the onward value every later month keeps, not that month’s own', () => {
    // $400 from August on, $420 for November only: "from November on" changes $400.
    expect(change({ kind: 'set_budget', category: 'Groceries', month: '2026-11', amount: '420' })).toMatchObject({
      item: { month: '2026-11-01', applies: 'onward', amount: 42000, before: { cents: 40000 } },
    })
  })

  it.each([
    ['a category the owner does not have', { category: 'Petrol' }, 'unknown_category'],
    ['last month', { month: '2026-09' }, 'bad_month'],
    ['thirteen months on', { month: '2027-11' }, 'bad_month'],
    ['over $100,000', { amount: '100,000.01' }, 'bad_amount'],
  ])('refuses %s', (_, c, code) => {
    expect(change({ kind: 'set_budget', category: 'Groceries', amount: '450', ...c })).toEqual({ refused: code })
  })

  it('takes twelve months on', () => {
    expect(change({ kind: 'set_budget', category: 'Groceries', month: '2027-10', amount: '1' })).toMatchObject({ item: { month: '2027-10-01' } })
  })
})

describe('a weekly limit', () => {
  it('names the category, and leaves the before to the database', () => {
    expect(change({ kind: 'set_weekly_limit', category: 'Groceries', amount: '120' })).toEqual({ item: { kind: 'set_weekly_limit', category: 'c-food', amount: 12000, ...why } })
    expect(change({ kind: 'set_weekly_limit', category: 'Groceries', amount: null })).toMatchObject({ item: { amount: null } })
  })
})

describe('a bill', () => {
  it('keeps the part not suggested as it is in effect, and says both as before', () => {
    expect(change({ kind: 'set_bill', category: 'Rent', amount: '1,550' })).toEqual({
      item: { kind: 'set_bill', category: 'c-rent', month: '2026-10-01', amount: 155000, due_day: 1, before: { cents: 150000, due_day: 1 }, ...why },
    })
    expect(change({ kind: 'set_bill', category: 'Rent', from_month: '2026-12', due_day: 3 })).toMatchObject({ item: { month: '2026-12-01', amount: 150000, due_day: 3 } })
    expect(change({ kind: 'set_bill', category: 'Rent', amount: null })).toMatchObject({ item: { amount: null, due_day: 1 } })
  })

  it('starts from nothing where no amount was ever typed', () => {
    expect(change({ kind: 'set_bill', category: 'Groceries', due_day: 2 })).toMatchObject({ item: { amount: null, due_day: 2, before: { cents: null, due_day: null } } })
  })
})

describe('a goal', () => {
  it('names the goal, and sends only the parts suggested', () => {
    expect(change({ kind: 'set_goal', goal: 'Flight', target: '2,500' })).toEqual({ item: { kind: 'set_goal', goal: 'g-trip', target: 250000, ...why } })
    expect(change({ kind: 'set_goal', goal: 'Flight', target_date: '2027-05-01' })).toEqual({ item: { kind: 'set_goal', goal: 'g-trip', target_date: '2027-05-01', ...why } })
    expect(change({ kind: 'set_goal', goal: 'Flight', target_date: null })).toMatchObject({ item: { target_date: null } })
  })

  it.each([
    ['a goal the owner does not have', { goal: 'Car' }, 'unknown_goal'],
    ['a target of $0', { target: '0' }, 'bad_amount'],
    ['today', { target_date: '2026-10-05' }, 'bad_date'],
    ['2100', { target_date: '2100-01-01' }, 'bad_date'],
    ['a day no calendar has', { target_date: '0000-02-29' }, 'bad_date'],
  ])('refuses %s', (_, c, code) => {
    expect(change({ kind: 'set_goal', goal: 'Flight', target: '2,500', ...c })).toEqual({ refused: code })
  })
})

it('says every refusal in a sentence of its own', () => {
  expect(Object.values(CHANGE_SENTENCES).every((s) => s.length > 20 && !s.includes('undefined'))).toBe(true)
  expect(isoDate(OWNER.today)).toBe('2026-10-05')
})

describe('a category or charge change', () => {
  const TXN = 'eeeeeeee-0000-4000-8000-000000000001'
  it('names the category by id, and leaves a charge and a new name for the database to check', () => {
    expect(change({ kind: 'rename_category', category: 'Rent', new_name: 'Housing' })).toEqual({ item: { kind: 'rename_category', category: 'c-rent', new_name: 'Housing', ...why } })
    expect(change({ kind: 'add_category', name: 'Pet care', list: 'variable' })).toEqual({ item: { kind: 'add_category', name: 'Pet care', list: 'variable', ...why } })
    expect(change({ kind: 'move_category', category: 'Groceries', to_list: 'transfer' })).toEqual({ item: { kind: 'move_category', category: 'c-food', to_list: 'transfer', ...why } })
    expect(change({ kind: 'recategorise', transaction: TXN, category: 'Rent' })).toEqual({ item: { kind: 'recategorise', transaction: TXN, category: 'c-rent', ...why } })
    expect(change({ kind: 'learn_shop', transaction: TXN, category: 'Rent' })).toMatchObject({ item: { kind: 'learn_shop', category: 'c-rent' } })
  })

  it('refuses a category the owner does not have', () => {
    expect(change({ kind: 'move_category', category: 'Petrol', to_list: 'bill' })).toEqual({ refused: 'unknown_category' })
  })
})
