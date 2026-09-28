import { describe, expect, it } from 'vitest'
import {
  countPendingBetween,
  hasImportedStatement,
  latestStatementEnd,
  listBudgetHistory,
  listTransactions,
  type BudgetRow,
  type LedgerRow,
} from '../src/ledger.js'
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

describe('listBudgetHistory', () => {
  const typed = (id: string, month: string): BudgetRow => ({
    id, category_id: 'c1', month, applies: 'onward', budget_cents: 100,
  })
  const history = () => {
    const fake = createFakeSupabase({
      category_budgets: [typed('b3', '2026-09-01'), typed('b1', '2026-01-01'), typed('b4', '2026-10-01'), typed('b2', '2026-09-01')],
    })
    fake.server.maxRows = 2
    return fake
  }

  it('reads everything typed for the month or before it, across pages, and nothing after', async () => {
    expect((await listBudgetHistory(history().client, '2026-09-01')).map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
  })

  it('refuses a read the budgets changed under', async () => {
    const fake = history()
    fake.server.afterRead = () => {
      fake.tables.category_budgets.splice(0, 1)
      fake.server.afterRead = null
    }
    await expect(listBudgetHistory(fake.client, '2026-09-01')).rejects.toThrow(
      'Your budgets changed while they were being read, so this month is not shown. Try again.',
    )
  })
})

describe('latestStatementEnd', () => {
  it("is the latest statement period's end, whatever order the imports came in", async () => {
    const fake = createFakeSupabase({
      ingest_batches: [
        { id: 'b1', source: 'card_pdf', created_at: '2026-08-09T10:00:00Z', period_end: '2026-08-07' },
        { id: 'b2', source: 'card_pdf', created_at: '2026-09-09T10:00:00Z', period_end: '2026-09-07' },
        // A photo and a typed row have no period, and never move the date.
        { id: 'b3', source: 'receipt_photo', created_at: '2026-09-20T10:00:00Z', period_end: null },
        { id: 'b4', source: 'typed', created_at: '2026-09-21T10:00:00Z' },
        // Re-importing August later does not take the date back.
        { id: 'b5', source: 'card_pdf', created_at: '2026-09-22T10:00:00Z', period_end: '2026-08-07' },
      ],
    })
    expect(await latestStatementEnd(fake.client)).toEqual(['2026-09-07'])
  })

  it('is empty before any statement, and says so when it cannot be read', async () => {
    const fake = createFakeSupabase({ ingest_batches: [{ id: 'b1', source: 'typed', created_at: '2026-09-21T10:00:00Z' }] })
    expect(await latestStatementEnd(fake.client)).toEqual([])
    fake.fail('ingest_batches', '42501')
    await expect(latestStatementEnd(fake.client)).rejects.toThrow(/does not allow this/)
  })
})

describe('countPendingBetween', () => {
  const candidate = (id: string, posted_on: string, status = 'pending') => ({
    id, posted_on, amount_cents: -100, merchant: 'SYNTHETIC SHOP', merchant_raw: 'SYNTHETIC SHOP', status,
  })

  it("counts only the range's charges still waiting, both ends included, past any page cap", async () => {
    const fake = createFakeSupabase({
      ingest_candidates: [
        candidate('p1', '2026-09-01'),
        candidate('p2', '2026-09-30'),
        candidate('p3', '2026-09-15'),
        candidate('p4', '2026-09-15', 'approved'),
        candidate('p5', '2026-08-31'),
        candidate('p6', '2026-10-01'),
      ],
    })
    fake.server.maxRows = 1
    expect(await countPendingBetween(fake.client, SEPTEMBER)).toBe(3)
  })

  it('says so when the queue cannot be read', async () => {
    const fake = createFakeSupabase()
    fake.fail('ingest_candidates', '42501')
    await expect(countPendingBetween(fake.client, SEPTEMBER)).rejects.toThrow(/does not allow this/)
  })
})

describe('hasImportedStatement', () => {
  const batch = (id: string, source: 'card_csv' | 'card_xlsx' | 'card_pdf' | 'receipt_photo' | 'typed') => ({ id, source, created_at: '2026-09-02T10:00:00Z' })

  it('counts a card statement, and never a typed row or a receipt photo', async () => {
    expect(await hasImportedStatement(createFakeSupabase({ ingest_batches: [batch('b1', 'typed'), batch('b2', 'receipt_photo')] }).client)).toBe(false)
    for (const source of ['card_csv', 'card_xlsx', 'card_pdf'] as const) {
      expect(await hasImportedStatement(createFakeSupabase({ ingest_batches: [batch('b1', 'typed'), batch('b2', source)] }).client)).toBe(true)
    }
  })

  it('says so when the imports cannot be read', async () => {
    const fake = createFakeSupabase()
    fake.fail('ingest_batches', '42501')
    await expect(hasImportedStatement(fake.client)).rejects.toThrow(/does not allow this/)
  })
})
