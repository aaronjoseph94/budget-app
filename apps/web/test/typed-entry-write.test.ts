import { describe, expect, it, vi } from 'vitest'
import { addTypedTransaction, type TypedEntry } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * A typed entry's write (0023, backend-a-07): it carries its entry id, so
 * Add pressed again after a lost answer is the same entry; and before 0023
 * is pasted it still adds, through the call that takes no entry id.
 */
const ENTRY: TypedEntry = {
  entryId: '0b0b0b0b-0000-4000-8000-000000000001',
  accountId: 'a1',
  postedOn: '2026-09-30',
  amountCents: -450,
  merchantRaw: 'Invented kiosk',
  categoryId: 'c1',
}

describe('adding a typed entry', () => {
  it('sends its entry id', async () => {
    const fake = createFakeSupabase()
    fake.rpcReplies.add_typed_transaction = 'cand-1'
    await addTypedTransaction(fake.client, ENTRY)
    expect(fake.rpcCalls).toEqual([
      {
        name: 'add_typed_transaction',
        args: {
          p_account_id: 'a1', p_posted_on: '2026-09-30', p_amount_cents: -450, p_merchant: 'INVENTED KIOSK',
          p_merchant_raw: 'Invented kiosk', p_category: 'c1', p_entry: '0b0b0b0b-0000-4000-8000-000000000001',
        },
      },
    ])
  })

  it('still adds before 0023 is pasted, through the call without an entry id', async () => {
    const fake = createFakeSupabase()
    fake.rpcReplies.add_typed_transaction = 'cand-1'
    const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function', details: '', hint: '' } }
    vi.spyOn(fake.client, 'rpc').mockReturnValueOnce(Promise.resolve(missing) as never)
    await addTypedTransaction(fake.client, ENTRY)
    expect(fake.rpcCalls.map((c) => [c.name, 'p_entry' in c.args, c.args.p_amount_cents])).toEqual([['add_typed_transaction', false, -450]])

    vi.spyOn(fake.client, 'rpc').mockReturnValueOnce(Promise.resolve(missing) as never)
    fake.fail('rpc/add_typed_transaction', '42501')
    await expect(addTypedTransaction(fake.client, ENTRY)).rejects.toThrow(/\(code 42501\)$/)
  })

  it('says what it was cannot be stored when the database refuses its characters (backend-a-06)', async () => {
    const fake = createFakeSupabase()
    fake.fail('rpc/add_typed_transaction', '23514')
    await expect(addTypedTransaction(fake.client, ENTRY)).rejects.toThrow(
      'What it was has characters the app cannot store, so nothing was saved. Use letters, numbers and ordinary punctuation. (code 23514)',
    )
  })

  it('says why on any other failure, and does not try again', async () => {
    const fake = createFakeSupabase()
    fake.fail('rpc/add_typed_transaction', '42501')
    await expect(addTypedTransaction(fake.client, ENTRY)).rejects.toThrow(/^That category, account or line is no longer there.*\(code 42501\)$/)
  })
})
