import { describe, expect, it } from 'vitest'
import { MerchantRuleRowSchema, TransactionRowSchema } from '../src/index.js'

const UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
const HASH = 'a'.repeat(64)
const NOW = '2025-03-01T12:30:00Z'

describe('TransactionRowSchema', () => {
  const ledgerRow = {
    id: UUID,
    user_id: UUID,
    account_id: UUID,
    posted_on: '2025-03-01',
    amount_cents: -8000,
    merchant: 'BLUE BOTTLE COFFEE',
    merchant_raw: 'SQ *BLUE BOTTLE COFFEE 4155551234',
    category_id: UUID,
    dedupe_hash: HASH,
    dedupe_hash_v: 1,
    source: 'card_csv',
    created_at: NOW,
  }

  it('accepts a categorized ledger row', () => {
    expect(TransactionRowSchema.safeParse(ledgerRow).success).toBe(true)
  })

  it('carries sign: outflows negative, inflows positive', () => {
    // See docs/divergences.md D3. One table replaces the workbook's three.
    expect(TransactionRowSchema.parse(ledgerRow).amount_cents).toBe(-8000)
    expect(TransactionRowSchema.parse({ ...ledgerRow, amount_cents: 250_000 }).amount_cents).toBe(
      250000,
    )
  })

  it('refuses an uncategorized ledger row', () => {
    // Uncategorized is a decision nobody has made, and the queue is where those
    // wait. In the ledger it would silently join a total.
    expect(TransactionRowSchema.safeParse({ ...ledgerRow, category_id: null }).success).toBe(false)
  })

  it('requires a versioned dedupe hash', () => {
    // CLAUDE.md stores the hash with a version column so its inputs can change.
    expect(TransactionRowSchema.safeParse({ ...ledgerRow, dedupe_hash_v: 0 }).success).toBe(false)
    expect(TransactionRowSchema.safeParse({ ...ledgerRow, dedupe_hash: 'nope' }).success).toBe(
      false,
    )
    expect(
      TransactionRowSchema.safeParse({ ...ledgerRow, dedupe_hash: HASH.toUpperCase() }).success,
    ).toBe(false)
  })

  it('rejects an unknown ingestion source rather than accepting free text', () => {
    expect(TransactionRowSchema.safeParse({ ...ledgerRow, source: 'imported' }).success).toBe(false)
  })

  it('strips unknown columns rather than failing an additive migration', () => {
    const parsed = TransactionRowSchema.parse({ ...ledgerRow, note_added_later: 'hello' })
    expect('note_added_later' in parsed).toBe(false)
  })
})

describe('MerchantRuleRowSchema', () => {
  const rule = {
    id: UUID,
    user_id: UUID,
    match_merchant: 'BLUE BOTTLE COFFEE',
    category_id: UUID,
    created_at: NOW,
    last_matched_at: null,
  }

  it('accepts a rule that has never matched', () => {
    expect(MerchantRuleRowSchema.safeParse(rule).success).toBe(true)
  })

  it('requires a category, since matching one is the rule’s whole purpose', () => {
    expect(MerchantRuleRowSchema.safeParse({ ...rule, category_id: null }).success).toBe(false)
  })
})
