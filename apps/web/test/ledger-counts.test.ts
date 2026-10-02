import { describe, expect, it } from 'vitest'
import { listPending, listUnreadable, saveImport } from '../src/ledger.js'
import type { SupabaseClient } from '../src/supabase.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * A count the app cannot read is refused, never filled in (architecture-b-04;
 * CONSTRAINTS' Floor: no silent numeric fallback). The queue's size used to
 * fall back to the length of the page it read, the very cap the count
 * exists to see past, and an import's auto-approved count to 0, so every row
 * filed by a rule read as waiting.
 */
const IMPORT = { userId: 'u1', accountId: 'a1', source: 'card_csv' as const, parsed: 0, accepted: [], rejected: [] }

/** A client whose every read answers these rows and no count. */
function uncounted(rows: readonly unknown[]): SupabaseClient {
  const chain: Record<string, unknown> = {}
  for (const step of ['select', 'eq', 'is', 'in', 'order', 'limit']) chain[step] = () => chain
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null, count: null })
  const client: unknown = { from: () => chain }
  return client as SupabaseClient
}

describe('the counts the data layer reads', () => {
  it('refuses a queue it could not count, rather than calling the page its size', async () => {
    await expect(listPending(uncounted([]))).rejects.toThrow('could not be counted')
    await expect(listUnreadable(uncounted([]))).rejects.toThrow('could not be counted')
  })

  it('refuses an import reply with no auto-approved count, or one that is not a whole number', async () => {
    for (const reply of [
      { batch_id: 'b1', parsed: 2, deduped: 0, inserted: 2, rejected: 0 },
      { batch_id: 'b1', parsed: 2, deduped: 0, inserted: 2, rejected: 0, auto_approved: 1.5 },
      { batch_id: 'b1', parsed: 2, deduped: 0, inserted: 'two', rejected: 0, auto_approved: 0 },
    ]) {
      const fake = createFakeSupabase()
      fake.rpcReplies.save_import = [reply]
      await expect(saveImport(fake.client, IMPORT), JSON.stringify(reply)).rejects.toThrow()
    }
  })

  it('reads a whole reply as before', async () => {
    const fake = createFakeSupabase()
    fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 3, deduped: 0, inserted: 3, rejected: 0, auto_approved: 1 }]
    expect(await saveImport(fake.client, IMPORT)).toEqual({ batchId: 'b1', inserted: 3, deduped: 0, rejected: 0, autoApproved: 1, waiting: 2 })
  })
})
