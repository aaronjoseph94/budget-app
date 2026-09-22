/**
 * The closed vocabularies. Every one of these is safe to log: CLAUDE.md allows
 * logs to carry ids, enum codes, and counts, and these are the enum codes.
 *
 * Values are snake_case because they are stored as Postgres enums and these
 * schemas describe the row as it crosses the wire, not a JS-side rename of it.
 */
import { z } from 'zod'

/** How a row entered the system. */
export const IngestSourceSchema = z.enum(['card_csv', 'card_xlsx', 'receipt_photo', 'typed'])
export type IngestSource = z.infer<typeof IngestSourceSchema>

/** Where a candidate is in the review queue. There is no fourth state. */
export const CandidateStatusSchema = z.enum(['pending', 'approved', 'rejected'])
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>

/**
 * Who chose the category. This is the field the approval invariant turns on.
 *
 * `merchant_rule` is a deterministic exact lookup and may auto-approve.
 * `model` is a judgment and must never auto-approve, however confident.
 * `user` is a decision already made by a human.
 */
export const CategorySourceSchema = z.enum(['merchant_rule', 'model', 'user'])
export type CategorySource = z.infer<typeof CategorySourceSchema>

/**
 * Why a row did not reach the ledger.
 *
 * CLAUDE.md: every ingestion failure creates a visible review-queue row with a
 * readable reason, and no failure ends in a log line alone. This is that
 * reason, as a code the UI renders into a sentence — not free text, so the
 * set stays countable and the counts can be made to balance.
 */
export const RejectionReasonSchema = z.enum([
  'missing_amount',
  'missing_date',
  'unparseable_amount',
  'unparseable_date',
  'missing_merchant',
  'duplicate_within_batch',
  'already_in_ledger',
  'model_output_invalid',
  'user_rejected',
])
export type RejectionReason = z.infer<typeof RejectionReasonSchema>
