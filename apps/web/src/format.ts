/**
 * The one place money becomes a string.
 *
 * CLAUDE.md invariant 2 allows exactly one display helper, and this is it.
 * Everywhere else money is integer `Cents`.
 *
 * It formats from the integer directly rather than dividing by 100 first: a
 * division would hand the formatter a float, and the whole point of storing
 * minor units is that no float ever touches an amount.
 */
const GROUPED = new Intl.NumberFormat('en-US')

export function formatCents(amountCents: number): string {
  const negative = amountCents < 0
  const magnitude = Math.abs(amountCents)
  const whole = Math.floor(magnitude / 100)
  const fraction = magnitude % 100
  const body = `$${GROUPED.format(whole)}.${String(fraction).padStart(2, '0')}`
  return negative ? `-${body}` : body
}

/** `2025-03-04` as `4 Mar 2025`. Parsed by parts, never through Date. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  if (year === undefined || month === undefined || day === undefined) return isoDate
  const name = MONTHS[Number(month) - 1]
  if (name === undefined) return isoDate
  return `${Number(day)} ${name} ${year}`
}

/**
 * A rejection code as a sentence a person can act on.
 *
 * CLAUDE.md requires every ingestion failure to reach the review queue with a
 * READABLE reason. The enum is what the database stores and what logs may
 * carry; this is what the user reads. Neither doubles as the other.
 */
const REASONS: Record<string, string> = {
  row_shape_mismatch:
    'This row had a different number of columns than the rest of the file, so the values could not be trusted to line up.',
  missing_amount: 'This row had no amount.',
  missing_date: 'This row had no date.',
  unparseable_amount: 'The amount could not be read as money in the format you chose.',
  unparseable_date: 'The date could not be read in the format you chose.',
  missing_merchant: 'This row had no description.',
  invalid_merchant: 'The description contained characters that could display as something other than what is stored.',
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
    'A quotation mark opens somewhere in this file and never closes, so everything after it reads as one enormous value. Nothing was imported, because the rest of the file cannot be trusted.',
  text_after_closing_quote:
    'A value in this file has text immediately after its closing quotation mark, which is not something a CSV can mean.',
  too_many_rows: 'This file has more rows than the importer will read in one go.',
  field_too_large: 'A single value in this file is far larger than any transaction description should be.',
  invalid_delimiter: 'The column separator is not a single usable character.',
}

export function describeFailure(kind: string, line?: number): string {
  const body = FAILURES[kind] ?? 'This file could not be read.'
  return line === undefined ? body : `${body} It starts around line ${line}.`
}
