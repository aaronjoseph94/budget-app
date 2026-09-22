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
  DEDUPE_HASH_VERSION,
  assignDiscriminators,
  computeDedupeHash,
  dedupeCanonicalString,
  type DedupeInput,
  type OccurrenceDiscriminator,
} from './dedupe.js'
