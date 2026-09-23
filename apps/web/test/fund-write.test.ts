import { describe, expect, it } from 'vitest'
import { linkFund, listFundTransfers, listFunds, saveFund, type FundEdit } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * Savings funds (0013): a goal names its Savings-list fund, and its typed
 * balance is always written with the day it was true (D16, N52). The fake
 * server refuses what 0004 and 0013 refuse.
 */

const edit = (over: Partial<FundEdit> = {}): FundEdit => ({
  goalCents: 200_000,
  savedCents: 13_300,
  asOf: '2026-09-23',
  startDate: '2026-01-08',
  goalDate: '2027-10-08',
  ...over,
})

function withFunds() {
  return createFakeSupabase({
    categories: [
      { id: 'flight', name: 'Flight training', kind: 'savings', sort_order: 0, weekly_budget_cents: null },
      { id: 'travel', name: 'Travel', kind: 'savings', sort_order: 1, weekly_budget_cents: null },
      { id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
    ],
    // The goal Settings saved before 0013: no fund, no dates, no as-of day.
    savings_goals: [
      { id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 250_000, target_date: '2027-06-01', unit_cost_cents: 27_500, unit_label: 'flight time' },
    ],
  })
}

describe('savings funds', () => {
  it('reads a goal from before 0013 with its fund columns empty', async () => {
    const fake = withFunds()
    const [g] = await listFunds(fake.client)
    expect(g).toMatchObject({ id: 'g1', target_cents: 3_000_000, saved_cents: 250_000, unit_cost_cents: 27_500, category_id: null, start_date: null, balance_as_of: null })
  })

  it('links a goal to its fund as of a day, and keeps its typed amount', async () => {
    const fake = withFunds()
    await linkFund(fake.client, { goalId: 'g1', categoryId: 'flight', asOf: '2026-09-23' })
    expect(fake.tables.savings_goals[0]).toMatchObject({ category_id: 'flight', balance_as_of: '2026-09-23', saved_cents: 250_000 })
  })

  it('creates a fund goal under its fund name, and writes the balance with its day every time', async () => {
    const fake = withFunds()
    await saveFund(fake.client, { userId: 'u1', categoryId: 'travel', name: 'Travel', goalId: null }, edit())
    const made = fake.tables.savings_goals[1]
    expect(made).toMatchObject({
      user_id: 'u1', name: 'Travel', category_id: 'travel', target_cents: 200_000, saved_cents: 13_300,
      balance_as_of: '2026-09-23', start_date: '2026-01-08', target_date: '2027-10-08',
    })
    await saveFund(fake.client, { userId: 'u1', categoryId: 'travel', name: 'Travel', goalId: made!.id }, edit({ savedCents: 20_000, asOf: '2026-10-01', startDate: null }))
    expect(fake.tables.savings_goals[1]).toMatchObject({ saved_cents: 20_000, balance_as_of: '2026-10-01', start_date: null, name: 'Travel' })
    expect(fake.tables.savings_goals).toHaveLength(2)
  })

  it("reads only the funds' rows, from the earliest typed day", async () => {
    const fake = withFunds()
    const t = (id: string, posted_on: string, category_id: string) => ({ id, posted_on, amount_cents: -1_000, merchant_raw: 'Moved', category_id, source: 'typed' })
    fake.tables.transactions.push(t('t1', '2026-09-22', 'flight'), t('t2', '2026-09-23', 'flight'), t('t3', '2026-09-24', 'travel'), t('t4', '2026-09-24', 'food'), t('t5', '2026-09-30', 'flight'))
    const rows = await listFundTransfers(fake.client, ['flight', 'travel'], { from: '2026-09-23', to: '2026-09-29' })
    expect(rows.map((r) => r.id)).toEqual(['t2', 't3'])
    expect(await listFundTransfers(fake.client, [], { from: '2026-09-23', to: '2026-09-29' })).toEqual([])
  })

  it('says in words why nothing was saved', async () => {
    const fake = withFunds()
    const on = (categoryId: string, name: string) => ({ userId: 'u1', categoryId, name, goalId: null })
    await expect(saveFund(fake.client, on('food', 'Food'), edit())).rejects.toThrow(
      'Only a fund on your Savings list can have a savings goal. It may have been moved on another device. Nothing was saved. (code 23514)',
    )
    await expect(saveFund(fake.client, on('travel', 'Flight training'), edit())).rejects.toThrow(
      'That fund already has a goal, or another goal has this name. Nothing was saved. (code 23505)',
    )
    await expect(saveFund(fake.client, on('gone', 'Gone'), edit())).rejects.toThrow(
      'That fund is no longer there — it may have been removed on another device. Nothing was saved. (code 23503)',
    )
    fake.fail('savings_goals', 'PGRST204')
    await expect(linkFund(fake.client, { goalId: 'g1', categoryId: 'flight', asOf: '2026-09-23' })).rejects.toThrow(
      'Savings funds need a database update that has not been applied yet (0013 in the setup guide). Nothing was saved. (code PGRST204)',
    )
    expect(fake.tables.savings_goals).toHaveLength(1)
  })

  it('words a failed read for the Savings screen, never as "nothing was saved"', async () => {
    const early = withFunds()
    early.fail('savings_goals', '42703')
    await expect(listFunds(early.client)).rejects.toThrow(
      'Savings funds need a database update that has not been applied yet (0013 in the setup guide), so your funds cannot be shown. (code 42703)',
    )
    const odd = withFunds()
    odd.fail('transactions', '42501')
    await expect(listFundTransfers(odd.client, ['flight'], { from: '2026-09-01', to: '2026-09-23' })).rejects.toThrow(
      'Your savings funds could not be read, so they are not shown. Try again. (code 42501)',
    )
  })
})
