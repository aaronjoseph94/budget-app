/**
 * The closed vocabularies. Every one of these is safe to log: CLAUDE.md allows
 * logs to carry ids, enum codes, and counts, and these are the enum codes.
 *
 * Values are snake_case because they are stored as Postgres enums and these
 * schemas describe the row as it crosses the wire, not a JS-side rename of it.
 */
import { z } from 'zod'

/** How a row entered the system. `ai_app`: added to Review by a connected AI app (0019, 0020). */
export const IngestSourceSchema = z.enum(['card_csv', 'card_xlsx', 'card_pdf', 'receipt_photo', 'typed', 'ai_app'])
export type IngestSource = z.infer<typeof IngestSourceSchema>

/**
 * Which of the workbook's lists a category is on (migration 0005).
 *
 * The first six are the lists on the workbook's START HERE tab; `transfer` is the
 * app's own "Not spending", for money that only moves, like paying off the
 * card. The list decides which month block a charge lands in, so it is stored
 * with the category, never guessed from its name (docs/workbook-views-plan.md §3.2).
 * In the order the app shows them, which is START HERE's.
 */
export const CategoryKindSchema = z.enum([
  'income',
  'savings',
  'bill',
  'debt',
  'subscription',
  'variable',
  'transfer',
])
export type CategoryKind = z.infer<typeof CategoryKindSchema>

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
  /**
   * The record had a different number of fields than the header.
   *
   * Structural, so it is decided before any field is read: the mapped indexes
   * point at the wrong columns, and every value drawn through them is wrong
   * while looking perfectly valid. A four-field row against a three-column
   * header is the classic case — an unquoted comma in `SMITH, JOHN
   * LANDSCAPING` — where taking the last field as the amount gives the right
   * amount and a merchant silently truncated to `SMITH`.
   */
  'row_shape_mismatch',
  'missing_amount',
  'missing_date',
  'unparseable_amount',
  'unparseable_date',
  'missing_merchant',
  /** Present, but rejected by IngestedTextSchema: control characters, or too long. */
  'invalid_merchant',
  'duplicate_within_batch',
  'already_in_ledger',
  'model_output_invalid',
  'user_rejected',
])
export type RejectionReason = z.infer<typeof RejectionReasonSchema>
