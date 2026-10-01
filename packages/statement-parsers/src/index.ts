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
  parseTypedAmount,
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

export { normalizeMerchant, sameMerchant, similarMerchant } from './merchant.js'

export { proposeMapping, type MappingProposal, type ProposeInput } from './propose.js'

export { parseQuickEntry, type QuickEntry, type QuickEntryInput } from './quick-entry.js'

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

export {
  readPdfText,
  type PdfDocument,
  type PdfReadOutcome,
} from './pdf/read.js'
export { groupRows, type LayoutRow } from './pdf/layout.js'
export { type TextRun } from './pdf/text.js'
export { MAX_PDF_BYTES, type PdfFailure } from './pdf/objects.js'

export {
  LOOKBACK_DAYS,
  daysFromCivil,
  daysInMonth,
  isoDate,
  resolveYear,
  type StatementPeriod,
} from './formats/yearless-dates.js'

export {
  ROGERS_COLUMNS,
  readPeriod,
  readRogersStatement,
  readSummary,
  type RogersFailure,
  type RogersOutcome,
  type RogersRead,
  type RogersSummary,
} from './formats/rogers.js'
