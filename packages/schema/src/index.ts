/**
 * schema-contracts — every zod schema and DB row type.
 *
 * The executed contract between client, Edge Functions, and Postgres.
 * See CAPABILITY-MAP.md.
 */
export {
  CentsSchema,
  IsoDateSchema,
  UuidSchema,
  TimestampSchema,
  IngestedTextSchema,
} from './primitives.js'

export {
  CandidateStatusSchema,
  CategoryKindSchema,
  CategorySourceSchema,
  IngestSourceSchema,
  RejectionReasonSchema,
  type CandidateStatus,
  type CategoryKind,
  type CategorySource,
  type IngestSource,
  type RejectionReason,
} from './enums.js'

export {
  DedupeHashSchema,
  IngestBatchCountsSchema,
  IngestCandidateRowSchema,
  MerchantRuleRowSchema,
  TransactionRowSchema,
  type IngestBatchCounts,
  type IngestCandidateRow,
  type MerchantRuleRow,
  type TransactionRow,
} from './rows.js'

export {
  parseReceiptReply,
  type ReceiptFailure,
  type ReceiptOutcome,
  type ReceiptReading,
} from './receipt.js'
