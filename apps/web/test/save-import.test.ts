import { describe, expect, it } from 'vitest'
import { cents, isoDate } from '@budget/money-primitives'
import { saveImport } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * The statement period travels with a PDF import to the seven-argument
 * save_import (migration 0007), so "Statement imported up to" can come from
 * the statement. The dates and the merchant below are invented.
 */

function fakeWithSaveImport() {
  const fake = createFakeSupabase()
  fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 1, deduped: 0, inserted: 1, rejected: 0, auto_approved: 0 }]
  return fake
}

const ROWS = {
  userId: 'u1',
  accountId: 'a1',
  parsed: 1,
  rejected: [],
  accepted: [
    { line: 1, postedOn: isoDate('2026-08-12'), amountCents: cents(-1234), merchantRaw: 'SYNTHETIC CAFE', issuerTransactionId: undefined },
  ],
}

describe('saveImport and the statement period', () => {
  it('records a PDF statement’s period with the import', async () => {
    const fake = fakeWithSaveImport()
    const saved = await saveImport(fake.client, {
      ...ROWS,
      source: 'card_pdf',
      period: { from: isoDate('2026-08-08'), to: isoDate('2026-09-07') },
    })

    expect(saved).toMatchObject({ batchId: 'b1', inserted: 1, waiting: 1 })
    expect(fake.rpcCalls).toHaveLength(1)
    expect(fake.rpcCalls[0]).toMatchObject({
      name: 'save_import',
      args: { p_source: 'card_pdf', p_parsed: 1, p_period_start: '2026-08-08', p_period_end: '2026-09-07' },
    })
  })

  it('sends no period for a CSV export, which prints none, so the five-argument function answers', async () => {
    const fake = fakeWithSaveImport()
    await saveImport(fake.client, { ...ROWS, source: 'card_csv' })

    const args = fake.rpcCalls[0]?.args ?? {}
    expect(Object.keys(args).sort()).toEqual(['p_account_id', 'p_parsed', 'p_rows', 'p_source', 'p_unreadable'])
  })
})
