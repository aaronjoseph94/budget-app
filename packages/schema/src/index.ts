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
  CategorySourceSchema,
  IngestSourceSchema,
  RejectionReasonSchema,
  type CandidateStatus,
  type CategorySource,
  type IngestSource,
  type RejectionReason,
} from './enums.js'

export {
  MerchantRuleRowSchema,
  TransactionRowSchema,
  type MerchantRuleRow,
  type TransactionRow,
} from './rows.js'
