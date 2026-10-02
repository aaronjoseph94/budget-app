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
import {
  CandidateStatusSchema,
  CategorySourceSchema,
  IngestSourceSchema,
  RejectionReasonSchema,
} from './enums.js'
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

const candidateShape = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  /** Groups the rows of one import, so its counts can be made to balance. */
  batch_id: UuidSchema,
  account_id: UuidSchema,
  posted_on: IsoDateSchema,
  amount_cents: CentsSchema,
  merchant: IngestedTextSchema,
  merchant_raw: IngestedTextSchema,
  /** Null until someone or something classifies it. */
  category_id: UuidSchema.nullable(),
  category_source: CategorySourceSchema.nullable(),
  status: CandidateStatusSchema,
  rejection_reason: RejectionReasonSchema.nullable(),
  dedupe_hash: DedupeHashSchema,
  dedupe_hash_v: z.int().positive(),
  source: IngestSourceSchema,
  auto_approved_at: TimestampSchema.nullable(),
  created_at: TimestampSchema,
})

/**
 * A row waiting for review.
 *
 * The refinements below are the approval invariant, made executable. They are
 * a second line, not the first: the database enforces the same rules as CHECK
 * constraints, because a schema in the client protects nothing from a bad
 * write that never passed through it. Both exist deliberately.
 */
export const IngestCandidateRowSchema = candidateShape.superRefine((row, ctx) => {
  const deny = (message: string, path: string) =>
    ctx.addIssue({ code: 'custom', message, path: [path] })

  // The invariant the whole review queue exists to enforce.
  if (row.category_source === 'model' && row.auto_approved_at !== null) {
    deny('A model-categorized candidate can never be auto-approved', 'auto_approved_at')
  }
  // Auto-approval is a deterministic lookup, so only a rule match may cause it.
  if (row.auto_approved_at !== null && row.category_source !== 'merchant_rule') {
    deny('Only an exact merchant_rules match may auto-approve', 'auto_approved_at')
  }
  // 0004's candidates_model_category_never_approved: a model's guess is
  // never the category of an approved row; approving it makes it the user's.
  if (row.status === 'approved' && row.category_source === 'model') {
    deny('A model-categorized candidate can never be approved', 'status')
  }
  if (row.auto_approved_at !== null && row.status !== 'approved') {
    deny('An auto-approved candidate must be approved', 'status')
  }
  // A category and its provenance travel together; neither is meaningful alone.
  if ((row.category_id === null) !== (row.category_source === null)) {
    deny('category_id and category_source must be set together', 'category_source')
  }
  if (row.status === 'approved' && row.category_id === null) {
    deny('An approved candidate must carry a category', 'category_id')
  }
  // No failure ends in a log line alone; the queue row must say why.
  if (row.status === 'rejected' && row.rejection_reason === null) {
    deny('A rejected candidate must carry a readable reason', 'rejection_reason')
  }
  if (row.status !== 'rejected' && row.rejection_reason !== null) {
    deny('Only a rejected candidate carries a rejection reason', 'rejection_reason')
  }
})
export type IngestCandidateRow = z.infer<typeof IngestCandidateRowSchema>

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

/**
 * The tally for one import.
 *
 * CLAUDE.md requires `parsed == deduped + inserted + rejected`. Asserting it
 * here makes a row that silently vanished during ingestion impossible to
 * report as a success.
 */
export const IngestBatchCountsSchema = z
  .object({
    batch_id: UuidSchema,
    parsed: z.int().nonnegative(),
    deduped: z.int().nonnegative(),
    inserted: z.int().nonnegative(),
    rejected: z.int().nonnegative(),
  })
  .refine((c) => c.parsed === c.deduped + c.inserted + c.rejected, {
    message: 'Counts must balance: parsed == deduped + inserted + rejected',
    path: ['parsed'],
  })
export type IngestBatchCounts = z.infer<typeof IngestBatchCountsSchema>

export { DedupeHashSchema }
