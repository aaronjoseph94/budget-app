/**
 * The words for an import's refused rows and refused files: drawn only by
 * the CSV preview and Review, so kept out of format.ts, which every screen
 * loads at the start (the first-load budget, scripts/check-bundle.mjs).
 */

/**
 * A rejection code as a sentence a person can act on.
 *
 * CLAUDE.md requires every ingestion failure to reach the review queue with a
 * READABLE reason. The enum is what the database stores and what logs may
 * carry; this is what the user reads. Neither doubles as the other.
 */
const REASONS: Record<string, string> = {
  row_shape_mismatch:
    'This row has a different number of columns from the rest. Its values could not be trusted to line up.',
  missing_amount: 'This row had no amount.',
  missing_date: 'This row had no date.',
  unparseable_amount: 'The amount could not be read as money in the format you chose.',
  // A detail the preview has, kept in Review as unparseable_amount (no such enum value).
  amount_too_large: 'This amount is too large to be a transaction.',
  // Likewise kept as invalid_merchant.
  merchant_too_long: 'The description is longer than 512 characters.',
  unparseable_date: 'The date could not be read in the format you chose.',
  missing_merchant: 'This row had no description.',
  invalid_merchant: 'The description has characters that could show as something other than what is stored.',
  duplicate_within_batch: 'This row appeared twice in the same file.',
  already_in_ledger: 'You already have this transaction.',
  model_output_invalid: 'The suggestion came back in a form that could not be used.',
  user_rejected: 'You rejected this.',
}

export function describeReason(reason: string): string {
  return REASONS[reason] ?? 'This row could not be read.'
}

/** A file-level failure, which stops the whole import rather than one row. */
const FAILURES: Record<string, string> = {
  unterminated_quote:
    'A quotation mark opens in this file and never closes. Everything after it reads as one value, so nothing was imported.',
  text_after_closing_quote:
    'A value has text right after its closing quotation mark, which a CSV cannot mean.',
  too_many_rows: 'This file has more rows than the importer will read in one go.',
  field_too_large: 'A single value in this file is far larger than any transaction description should be.',
  invalid_delimiter: 'The column separator is not a single usable character.',
}

export function describeFailure(kind: string, line?: number): string {
  const body = FAILURES[kind] ?? 'This file could not be read.'
  return line === undefined ? body : `${body} It starts around line ${line}.`
}
