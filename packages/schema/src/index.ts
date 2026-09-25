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

export {
  AI_CODES,
  AI_HELPER_VERSION,
  AI_KEY_SHAPE,
  AiProviderSchema,
  type AiAction,
  type AiCode,
  type AiFailureReply,
  type AiKeyProvider,
  type AiKeyReply,
  type AiKeySource,
  type AiKeyStatus,
  type AiModelChoice,
  type AiPingReply,
  type AiProvider,
  type AiRequest,
  type AiServiceStatus,
  type AiStatusReply,
  type AiTask,
} from './ai.js'

export { ModelProse, proseProblem, type ProseProblem } from './prose.js'

export {
  FACT_LETTER,
  NARRATE_LIMITS,
  QUOTE_ID,
  parseNarrateReply,
  type NarrateCard,
  type NarrateDaily,
  type NarrateDrop,
  type NarrateFact,
  type NarrateGoal,
  type NarrateParsed,
  type NarrateQuote,
  type NarrateReply,
} from './narrate.js'
