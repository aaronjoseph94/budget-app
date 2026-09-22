/**
 * statement-parsers — bytes in, validated rows out.
 *
 * Deterministic. The ~99% path: almost all of this user's spend arrives as a
 * card export, and none of it needs a model. See CAPABILITY-MAP.md.
 */
export {
  US_AMOUNT_FORMAT,
  applySignConvention,
  parseAmountToCents,
  type AmountFormat,
  type ParseOutcome,
  type SignConvention,
} from './amount.js'

export {
  detectHeaderRow,
  explainsAsRunningBalance,
  profileColumns,
  type ColumnProfile,
  type HeaderVerdict,
  type ProfileInput,
} from './columns.js'

export {
  MAX_FIELD_CHARS,
  MAX_ROWS,
  isBlankRow,
  tokenizeCsv,
  type CsvFailure,
  type CsvOptions,
  type CsvRow,
  type TokenizeOutcome,
} from './csv.js'

export {
  DATE_FORMATS,
  dateFormatCandidates,
  parseStatementDate,
  type DateFormat,
} from './date.js'

export {
  DEDUPE_HASH_VERSION,
  assignDiscriminators,
  computeDedupeHash,
  dedupeCanonicalString,
  type DedupeInput,
  type OccurrenceDiscriminator,
} from './dedupe.js'

export {
  readStatement,
  type AcceptedRow,
  type ColumnMapping,
  type ReadOptions,
  type RejectedRow,
  type StatementRead,
} from './read.js'
