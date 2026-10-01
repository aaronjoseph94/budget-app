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
  type ReceiptPhoto,
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
  AmountTextSchema,
  GetDebtsInputSchema,
  GetForecastInputSchema,
  GetPeriodInputSchema,
  GetSavingsGoalsInputSchema,
  GetSpendingInputSchema,
  ListCategoriesInputSchema,
  ListSchema,
  MCP_SERVER_VERSION,
  NameSchema,
  NoteTextSchema,
  WordsSchema,
} from './ai-apps.js'

export {
  FACT_LETTER,
  NARRATE_LIMITS,
  NARRATE_PROMPT_VERSION,
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

export {
  REPORT_LIMITS,
  REPORT_PROMPT_VERSION,
  parseReportReply,
  type NarrateReport,
  type ReportDrop,
  type ReportParsed,
  type ReportPoint,
  type ReportReply,
} from './report.js'

export {
  CHECKIN_LIMITS,
  CHECKIN_PROMPT_VERSION,
  parseCheckinReply,
  type CheckinDrop,
  type CheckinParsed,
  type CheckinPart,
  type CheckinReply,
  type NarrateCheckin,
} from './checkin.js'

export {
  CATEGORISE_LIMITS,
  CATEGORY_ALIAS,
  parseCategoriseReply,
  type CategoriseBrief,
  type CategoriseCategory,
  type CategoriseParsed,
  type CategorisePick,
  type CategoriseRow,
} from './categorise.js'

export {
  QUICK_ADD_LIMITS,
  amountIsTyped,
  parseQuickAddReply,
  type QuickAddBrief,
  type QuickAddField,
  type QuickAddParsed,
  type QuickAddPick,
} from './quick-add.js'

export {
  ASK_INTENTS,
  ASK_LIMITS,
  ASK_MONTHS,
  ASK_PERIODS,
  parseAskPlan,
  type AskBrief,
  type AskIntentName,
  type AskMonthName,
  type AskParsed,
  type AskPeriodName,
  type AskPeriodPick,
  type AskPlan,
  type AskTopic,
} from './ask.js'
