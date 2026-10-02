import { describe, expect, it } from 'vitest'
import {
  IngestBatchCountsSchema,
  IngestCandidateRowSchema,
  MerchantRuleRowSchema,
  TransactionRowSchema,
} from '../src/index.js'

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

/** A pending candidate nobody has classified yet: the state every row starts in. */
const pending = {
  id: UUID,
  user_id: UUID,
  batch_id: UUID,
  account_id: UUID,
  posted_on: '2025-03-01',
  amount_cents: -8000,
  merchant: 'BLUE BOTTLE COFFEE',
  merchant_raw: 'SQ *BLUE BOTTLE COFFEE 4155551234',
  category_id: null,
  category_source: null,
  status: 'pending',
  rejection_reason: null,
  dedupe_hash: HASH,
  dedupe_hash_v: 1,
  source: 'card_csv',
  auto_approved_at: null,
  created_at: NOW,
}

const candidate = (over: Record<string, unknown>) => ({ ...pending, ...over })

describe('IngestCandidateRowSchema — the approval invariant', () => {
  it('accepts a pending, unclassified row', () => {
    expect(IngestCandidateRowSchema.safeParse(pending).success).toBe(true)
  })

  it('refuses an approved row whose category a model chose, auto-approved or not, as 0004 does (architecture-a-13)', () => {
    const row = candidate({ category_id: UUID, category_source: 'model', status: 'approved', auto_approved_at: null })
    const result = IngestCandidateRowSchema.safeParse(row)
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(['status'])
  })

  it('accepts auto-approval from an exact merchant-rule match', () => {
    const row = candidate({
      category_id: UUID,
      category_source: 'merchant_rule',
      status: 'approved',
      auto_approved_at: NOW,
    })
    expect(IngestCandidateRowSchema.safeParse(row).success).toBe(true)
  })

  it('REFUSES to auto-approve a model-categorized row', () => {
    // The rule the entire review queue exists to enforce. A model may propose;
    // it may never post. CONSTRAINTS.md, "The approval invariant".
    const row = candidate({
      category_id: UUID,
      category_source: 'model',
      status: 'approved',
      auto_approved_at: NOW,
    })
    const result = IngestCandidateRowSchema.safeParse(row)
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('never be auto-approved')
  })

  it('accepts a model-categorized row that is merely proposed, not approved', () => {
    const row = candidate({ category_id: UUID, category_source: 'model', status: 'pending' })
    expect(IngestCandidateRowSchema.safeParse(row).success).toBe(true)
  })

  it('accepts a model suggestion a human then approved', () => {
    // Approved by a person, so `auto_approved_at` stays null and the source
    // becomes `user`. The suggestion was reviewed rather than trusted.
    const row = candidate({ category_id: UUID, category_source: 'user', status: 'approved' })
    expect(IngestCandidateRowSchema.safeParse(row).success).toBe(true)
  })

  it('refuses auto-approval by a human decision or with no provenance', () => {
    for (const source of ['user', null]) {
      const row = candidate({
        category_id: source === null ? null : UUID,
        category_source: source,
        status: 'approved',
        auto_approved_at: NOW,
      })
      expect(IngestCandidateRowSchema.safeParse(row).success).toBe(false)
    }
  })

  it('refuses an auto-approved row that is not marked approved', () => {
    const row = candidate({
      category_id: UUID,
      category_source: 'merchant_rule',
      status: 'pending',
      auto_approved_at: NOW,
    })
    expect(IngestCandidateRowSchema.safeParse(row).success).toBe(false)
  })

  it('requires a category and its provenance to travel together', () => {
    expect(IngestCandidateRowSchema.safeParse(candidate({ category_id: UUID })).success).toBe(false)
    expect(IngestCandidateRowSchema.safeParse(candidate({ category_source: 'model' })).success).toBe(
      false,
    )
  })

  it('refuses an approved row with no category', () => {
    expect(IngestCandidateRowSchema.safeParse(candidate({ status: 'approved' })).success).toBe(false)
  })

  it('requires a rejected row to say why, readably', () => {
    // No ingestion failure ends in a log line alone (CLAUDE.md).
    expect(IngestCandidateRowSchema.safeParse(candidate({ status: 'rejected' })).success).toBe(false)

    const withReason = candidate({ status: 'rejected', rejection_reason: 'already_in_ledger' })
    expect(IngestCandidateRowSchema.safeParse(withReason).success).toBe(true)
  })

  it('refuses a rejection reason on a row that was not rejected', () => {
    expect(
      IngestCandidateRowSchema.safeParse(candidate({ rejection_reason: 'already_in_ledger' }))
        .success,
    ).toBe(false)
  })

  it('rejects an unknown rejection reason rather than accepting free text', () => {
    const row = candidate({ status: 'rejected', rejection_reason: 'it looked wrong to me' })
    expect(IngestCandidateRowSchema.safeParse(row).success).toBe(false)
  })
})

describe('IngestBatchCountsSchema', () => {
  it('accepts counts that balance', () => {
    const counts = { batch_id: UUID, parsed: 10, deduped: 3, inserted: 6, rejected: 1 }
    expect(IngestBatchCountsSchema.safeParse(counts).success).toBe(true)
  })

  it('refuses a batch where a row silently vanished', () => {
    // parsed == deduped + inserted + rejected (CLAUDE.md). 10 in, 9 accounted for.
    const counts = { batch_id: UUID, parsed: 10, deduped: 3, inserted: 5, rejected: 1 }
    const result = IngestBatchCountsSchema.safeParse(counts)
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('Counts must balance')
  })

  it('accepts an empty batch, and refuses a negative count', () => {
    const empty = { batch_id: UUID, parsed: 0, deduped: 0, inserted: 0, rejected: 0 }
    expect(IngestBatchCountsSchema.safeParse(empty).success).toBe(true)
    const negative = { batch_id: UUID, parsed: 0, deduped: -1, inserted: 1, rejected: 0 }
    expect(IngestBatchCountsSchema.safeParse(negative).success).toBe(false)
  })
})
