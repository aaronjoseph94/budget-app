import { describe, expect, it } from 'vitest'
import { listTransactions, type LedgerRow } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * A month's ledger is read whole or not at all. Supabase answers at most
 * 1,000 rows per request whatever limit is asked for, so one request can
 * silently return part of a month, and every total drawn from it is then too
 * low. The server here is capped at two rows so a five-row month needs pages.
 * Merchants are invented.
 */

const row = (id: string, posted_on: string): LedgerRow => ({
  id,
  posted_on,
  amount_cents: -100,
  merchant_raw: 'SYNTHETIC SHOP',
  category_id: 'c1',
  source: 'card_pdf',
})
const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' }

function capped() {
  const fake = createFakeSupabase({
    transactions: [
      row('t1', '2026-09-01'),
      row('t2', '2026-09-30'),
      // Stored out of id order: t3 and t4 share a date and straddle the first
      // page break, so only ordering by id keeps each on one page.
      row('t4', '2026-09-15'),
      row('t3', '2026-09-15'),
      row('t5', '2026-09-10'),
      row('t6', '2026-10-01'),
    ],
  })
  fake.server.maxRows = 2
  return fake
}

describe('listTransactions', () => {
  it('reads every row of the month across pages, newest first, and nothing outside it', async () => {
    const rows = await listTransactions(capped().client, SEPTEMBER)
    expect(rows.map((r) => r.id)).toEqual(['t2', 't3', 't4', 't5', 't1'])
  })

  it('refuses a read the ledger changed under, rather than show part of the month', async () => {
    const fake = capped()
    fake.server.afterRead = () => {
      fake.tables.transactions.splice(0, 1)
      fake.server.afterRead = null
    }
    await expect(listTransactions(fake.client, SEPTEMBER)).rejects.toThrow(
      'Your transactions changed while this period was being read, so nothing is shown. Try again.',
    )
  })

  it('refuses a read where a row came back twice, even though the count held', async () => {
    const fake = capped()
    // After the first page: a newer row arrives and an older one goes, so the
    // count stays five but every later row moves down one and t3 repeats.
    fake.server.afterRead = () => {
      fake.tables.transactions.push(row('t0', '2026-09-20'))
      fake.tables.transactions.splice(
        fake.tables.transactions.findIndex((r) => r.id === 't1'),
        1,
      )
      fake.server.afterRead = null
    }
    await expect(listTransactions(fake.client, SEPTEMBER)).rejects.toThrow('Your transactions changed')
  })

  it('reads an empty month as empty', async () => {
    expect(await listTransactions(capped().client, { from: '2026-11-01', to: '2026-11-30' })).toEqual([])
  })
})
