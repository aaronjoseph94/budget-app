/**
 * The row shapes, as Postgres stores them.
 *
 * Fields are snake_case, matching the column names, because these schemas
 * describe the row as it crosses the wire. A camelCase mirror would be a
 * second naming of every field that can drift from the first; engine inputs
 * are mapped explicitly at the call site instead.
 *
 * Unknown keys are stripped rather than rejected: an additive migration should
 * not break every read until the client catches up. Known fields are still
 * validated, so a column whose *type* changed still fails loudly.
 *
 * SIGN CONVENTION: amounts are signed, outflows negative and inflows positive.
 * The workbook kept three parallel ledgers and inferred direction from which
 * sheet a row sat on; one table cannot do that. See docs/divergences.md D3.
 */
import { z } from 'zod'
import { IngestSourceSchema } from './enums.js'
import {
  CentsSchema,
  IngestedTextSchema,
  IsoDateSchema,
  TimestampSchema,
  UuidSchema,
} from './primitives.js'

/** A lowercase hex SHA-256 digest, stored alongside the version that produced it. */
const DedupeHashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Expected a lowercase hex SHA-256 digest')

/**
 * A row in the ledger. There is exactly one path here, and it runs through
 * `ingest_candidates` — see CONSTRAINTS.md, "The approval invariant".
 *
 * `category_id` is NOT nullable. An uncategorized row is a decision nobody has
 * made yet, and that is what the review queue is for; once a row is in the
 * ledger it counts toward a total, and a total with an unclassified member in
 * it is a wrong number on a screen.
 */
export const TransactionRowSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  account_id: UuidSchema,
  posted_on: IsoDateSchema,
  amount_cents: CentsSchema,
  /** Normalized for display and for matching merchant rules. */
  merchant: IngestedTextSchema,
  /** Exactly as the statement wrote it; what the dedupe hash is computed over. */
  merchant_raw: IngestedTextSchema,
  category_id: UuidSchema,
  dedupe_hash: DedupeHashSchema,
  dedupe_hash_v: z.int().positive(),
  source: IngestSourceSchema,
  created_at: TimestampSchema,
})
export type TransactionRow = z.infer<typeof TransactionRowSchema>

/**
 * A learned rule. An exact match on `match_merchant` is the only thing allowed
 * to categorize a row without a human, so the match is equality on an already
 * normalized string — never a pattern, a prefix, or a similarity score.
 */
export const MerchantRuleRowSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  match_merchant: IngestedTextSchema,
  category_id: UuidSchema,
  created_at: TimestampSchema,
  last_matched_at: TimestampSchema.nullable(),
})
export type MerchantRuleRow = z.infer<typeof MerchantRuleRowSchema>

export { DedupeHashSchema }
