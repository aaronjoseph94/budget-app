import { describe, expect, it } from 'vitest'
import { setBudget, type BudgetEdit } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * Typing a budget or goal on a month writes what the owner meant (0008,
 * D12), and nothing else: never a copy into another month. The fake server
 * upserts on 0008's key and refuses what 0008 refuses.
 */

const september = (applies: BudgetEdit['applies'], budgetCents: number | null, replacesOnly = false): BudgetEdit => ({
  userId: 'u1', categoryId: 'food', month: '2026-09-01', applies, budgetCents, replacesOnly,
})
const stored = (fake: ReturnType<typeof createFakeSupabase>) =>
  fake.tables.category_budgets.map((b) => [b.month, b.applies, b.budget_cents])

function withFood() {
  return createFakeSupabase({ categories: [{ id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }] })
}

describe('setBudget', () => {
  it('writes "from this month on" once, replacing it when typed over, and "just this month" beside it', async () => {
    const fake = withFood()
    await setBudget(fake.client, september('onward', 40000))
    await setBudget(fake.client, september('onward', 45000))
    await setBudget(fake.client, september('only', 10000))
    expect(stored(fake)).toEqual([
      ['2026-09-01', 'onward', 45000],
      ['2026-09-01', 'only', 10000],
    ])
    expect(fake.tables.category_budgets.map((b) => b.user_id)).toEqual(['u1', 'u1'])
  })

  it('gives the month\'s own "just this month" value the same amount, in the same write, when asked', async () => {
    const fake = withFood()
    await setBudget(fake.client, september('only', 10000))
    await setBudget(fake.client, september('onward', 45000, true))
    expect(stored(fake)).toEqual([
      ['2026-09-01', 'only', 45000],
      ['2026-09-01', 'onward', 45000],
    ])
    // Never for "just this month" itself, which has only its own row.
    await setBudget(fake.client, september('only', 5000, true))
    expect(stored(fake)).toEqual([
      ['2026-09-01', 'only', 5000],
      ['2026-09-01', 'onward', 45000],
    ])
  })

  it('clears with a typed "no budget", which is not $0', async () => {
    const fake = withFood()
    await setBudget(fake.client, september('onward', 40000))
    await setBudget(fake.client, september('onward', null))
    expect(stored(fake)).toEqual([['2026-09-01', 'onward', null]])
  })

  it('says in words why nothing was saved', async () => {
    const fake = withFood()
    await expect(setBudget(fake.client, { ...september('onward', 100), categoryId: 'gone' })).rejects.toThrow(
      'That category is no longer there — it may have been removed on another device. Nothing was saved. (code 23503)',
    )
    await expect(setBudget(fake.client, september('onward', -100))).rejects.toThrow(
      'A budget or goal cannot be below zero. Nothing was saved. (code 23514)',
    )
    const unapplied = withFood()
    unapplied.fail('category_budgets', 'PGRST205')
    await expect(setBudget(unapplied.client, september('onward', 100))).rejects.toThrow(
      'Budgets need a database update that has not been applied yet (0008 in the setup guide). Nothing was saved. (code PGRST205)',
    )
    const refused = withFood()
    refused.fail('category_budgets', '42501')
    await expect(setBudget(refused.client, september('onward', 100))).rejects.toThrow(
      'Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)',
    )
    expect(fake.tables.category_budgets).toEqual([])
  })
})
