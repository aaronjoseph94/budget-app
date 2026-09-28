import { describe, expect, it } from 'vitest'
import { recategoriseTransaction } from '../src/ledger.js'
import { describeMoveFailure, describeWriteFailure } from '../src/format.js'
import { createFakeSupabase } from './fake-supabase.js'

function withCharge() {
  return createFakeSupabase({
    categories: [
      { id: 'dining', name: 'Restaurants', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
      { id: 'groceries', name: 'Groceries', kind: 'variable', sort_order: 1, weekly_budget_cents: null },
    ],
    transactions: [
      { id: 't1', posted_on: '2026-09-04', amount_cents: -2150, merchant_raw: 'SYNTHETIC MARKET', category_id: 'dining', source: 'card_pdf' },
    ],
  })
}

describe('recategoriseTransaction', () => {
  it("sends 0006's three arguments, with learning as asked", async () => {
    const fake = withCharge()
    await recategoriseTransaction(fake.client, { transactionId: 't1', categoryId: 'groceries', learn: true })
    await recategoriseTransaction(fake.client, { transactionId: 't1', categoryId: 'dining', learn: false })

    expect(fake.rpcCalls).toEqual([
      { name: 'recategorise_transaction', args: { p_transaction: 't1', p_category: 'groceries', p_learn: true } },
      { name: 'recategorise_transaction', args: { p_transaction: 't1', p_category: 'dining', p_learn: false } },
    ])
    expect(fake.tables.transactions[0]?.category_id).toBe('dining')
  })

  it('says in words why a move was refused, never the database message', async () => {
    const fake = withCharge()
    await expect(
      recategoriseTransaction(fake.client, { transactionId: 'gone', categoryId: 'groceries', learn: true }),
    ).rejects.toThrow('That charge or that category is no longer there — it may have changed on another device. Nothing was moved. (code 42501)')
    expect(fake.tables.transactions[0]?.category_id).toBe('dining')
  })

  // The owner has not pasted 0006 yet; the app must say that, not "code PGRST202".
  it('says a one-time update is missing when the function is not there yet', async () => {
    const fake = withCharge()
    delete fake.rpcReplies['recategorise_transaction']
    await expect(
      recategoriseTransaction(fake.client, { transactionId: 't1', categoryId: 'groceries', learn: true }),
    ).rejects.toThrow(/^Moving a charge needs a one-time update/)
  })
})

describe('describeMoveFailure', () => {
  it("never uses the import's wording for a refused check", () => {
    expect(describeMoveFailure({ code: '23514' })).toBe('That move breaks a rule the ledger follows, so nothing was moved. (code 23514)')
  })

  it('falls back to the everyday wording for connection and sign-in failures', () => {
    expect(describeMoveFailure(null)).toBe(describeWriteFailure(null))
    expect(describeMoveFailure({ code: '28000' })).toBe(describeWriteFailure({ code: '28000' }))
  })
})
