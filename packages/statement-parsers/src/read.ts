/**
 * Tokenized rows plus a column mapping, to transactions and refusals.
 *
 * The last step before the review queue, and the one that has to be honest
 * about arithmetic: every non-blank data row leaves here either accepted or
 * rejected, and `parsed === accepted + rejected` is asserted rather than
 * assumed. A row that quietly disappeared between the file and the queue is
 * the failure CLAUDE.md's count-balancing rule exists to make impossible, and
 * counts derived from intent rather than from what actually happened cannot
 * catch it.
 */
import { type Cents, type IsoDate } from '@budget/money-primitives'
import { IngestedTextSchema, type RejectionReason } from '@budget/schema'
import { type AmountFormat, type SignConvention, applySignConvention, parseAmountToCents } from './amount.js'
import { type DateFormat, parseStatementDate } from './date.js'
import { type CsvRow, isBlankRow } from './csv.js'

export interface ColumnMapping {
  readonly dateIndex: number
  readonly amountIndex: number
  readonly merchantIndex: number
  /** Absent when the export carries no transaction id of its own. */
  readonly issuerIdIndex?: number
  readonly sign: SignConvention
}

export interface ReadOptions {
  readonly mapping: ColumnMapping
  readonly amountFormat: AmountFormat
  readonly dateFormat: DateFormat
  readonly hasHeader: boolean
  /** Field count every record must have. Defaults to the header's width. */
  readonly expectedWidth?: number
}

export interface AcceptedRow {
  readonly line: number
  readonly postedOn: IsoDate
  readonly amountCents: Cents
  readonly merchantRaw: string
  readonly issuerTransactionId: string | undefined
}

export interface RejectedRow {
  readonly line: number
  readonly reason: RejectionReason
}

export interface StatementRead {
  /** Non-blank data rows considered. Blank lines are not transactions. */
  readonly parsed: number
  readonly accepted: readonly AcceptedRow[]
  readonly rejected: readonly RejectedRow[]
  /** Blank and delimiter-only lines, counted so the file is fully accounted for. */
  readonly blankSkipped: number
}

export function readStatement(rows: readonly CsvRow[], options: ReadOptions): StatementRead {
  // Blank rows are removed BEFORE the header is taken, because that is what
  // detectHeaderRow and profileColumns both do. When this module sliced
  // rows[0] instead, a file opening with a blank line made the three disagree
  // about which record is the header: those two reported the real headers, so
  // a caller wiring them together passed hasHeader, and this module then
  // treated the blank line as the header and every transaction as ragged —
  // nothing accepted, the arithmetic still balancing, and the user told that
  // rows are malformed when none are. Some exports do open with a blank line.
  const records = rows.filter((r) => !isBlankRow(r))
  const blankSkipped = rows.length - records.length
  const header = options.hasHeader ? records[0] : undefined
  const data = options.hasHeader ? records.slice(1) : records
  const width = options.expectedWidth ?? header?.fields.length ?? modalWidth(data)

  const accepted: AcceptedRow[] = []
  const rejected: RejectedRow[] = []

  for (const row of data) {
    const outcome = readRow(row, width, options)
    if (outcome.reason === undefined) accepted.push(outcome.row)
    else rejected.push({ line: row.line, reason: outcome.reason })
  }

  // Counted from the INPUT, not from the two output lists. Defining it as
  // accepted + rejected made every check of the balance a tautology that held
  // however many rows the loop lost — the shape of check this project treats
  // as no check at all.
  const parsed = data.length
  return { parsed, accepted, rejected, blankSkipped }
}

type RowOutcome =
  | { readonly reason: undefined; readonly row: AcceptedRow }
  | { readonly reason: RejectionReason }

/**
 * Read one record.
 *
 * Shape is checked first and on its own. When a record's field count differs
 * from the header's, the mapped indexes are pointing at whichever columns
 * happen to sit there, so every value read through them is untrustworthy even
 * when each one parses. Reporting a field-level reason here would name a
 * symptom and hide the cause.
 *
 * After that, the first failure in date, amount, merchant order is reported.
 * A row can fail in several ways at once and `rejection_reason` holds one
 * value; the order is fixed so the same bad row always reports the same
 * reason, rather than one that depends on evaluation order.
 */
function readRow(row: CsvRow, width: number, options: ReadOptions): RowOutcome {
  if (row.fields.length !== width) return { reason: 'row_shape_mismatch' }

  const { mapping } = options
  const dateCell = row.fields[mapping.dateIndex]
  const amountCell = row.fields[mapping.amountIndex]
  const merchantCell = row.fields[mapping.merchantIndex]

  // An index outside the record cannot happen once the width matches, but a
  // mapping built against a different file would do it. Treated as shape
  // rather than as a missing value, because that is what it is.
  if (dateCell === undefined || amountCell === undefined || merchantCell === undefined) {
    return { reason: 'row_shape_mismatch' }
  }

  const date = parseStatementDate(dateCell, options.dateFormat)
  if (!date.ok) return { reason: date.reason }

  const amount = parseAmountToCents(amountCell, options.amountFormat)
  if (!amount.ok) return { reason: amount.reason }

  if (merchantCell.length === 0) return { reason: 'missing_merchant' }
  // The text rules live in one place. Re-implementing them here would let the
  // two disagree, and this is the field a charge's issuer chooses.
  if (!IngestedTextSchema.safeParse(merchantCell).success) {
    return { reason: 'invalid_merchant' }
  }

  const issuerIndex = mapping.issuerIdIndex
  const issuerCell = issuerIndex === undefined ? undefined : row.fields[issuerIndex]

  return {
    reason: undefined,
    row: {
      line: row.line,
      postedOn: date.value,
      amountCents: applySignConvention(amount.value, mapping.sign),
      merchantRaw: merchantCell,
      // An id the export left blank is absent, not an identity — every such
      // row would otherwise share one dedupe key and all but the first vanish.
      issuerTransactionId: issuerCell !== undefined && issuerCell.length > 0 ? issuerCell : undefined,
    },
  }
}

/**
 * The field count most records agree on — the file's shape.
 *
 * Used only for a headerless file, where nothing declares the width. Taking
 * the WIDEST row instead let a single ragged record define the shape, so every
 * correct row in the file became a mismatch and the one malformed row was the
 * only one accepted. Ties go to the wider count, which is arbitrary but fixed.
 */
function modalWidth(rows: readonly CsvRow[]): number {
  const counts = new Map<number, number>()
  for (const row of rows) {
    const seen = counts.get(row.fields.length)
    counts.set(row.fields.length, seen === undefined ? 1 : seen + 1)
  }

  let width = 0
  let best = 0
  for (const [candidate, count] of counts) {
    if (count > best || (count === best && candidate > width)) {
      width = candidate
      best = count
    }
  }
  return width
}
