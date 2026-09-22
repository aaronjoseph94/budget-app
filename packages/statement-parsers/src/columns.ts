/**
 * What each column of a statement actually contains.
 *
 * Facts derived from the DATA, not from the header text. A header is a hint
 * the bank wrote for a human; several banks label a running balance "Amount",
 * and at least one writes two columns with the same name.
 *
 * COLUMNS ARE ADDRESSED BY INDEX, NEVER BY NAME. Keying a row object by header
 * loses a column outright when two headers collide, and a header named
 * `__proto__` or `constructor` does something worse than lose it. Index is the
 * only identifier a CSV actually guarantees.
 *
 * This module proposes. It never decides: where the data cannot distinguish
 * two readings, it says so and the importer asks, exactly as
 * `dateFormatCandidates` does for date formats.
 */
import { type DateFormat, dateFormatCandidates } from './date.js'
import { type AmountFormat, parseAmountToCents } from './amount.js'
import { type CsvRow, isBlankRow } from './csv.js'

export interface ColumnProfile {
  /** Position in the record. The column's only reliable identity. */
  readonly index: number
  /** As written by the bank, or null when the file has no header row. */
  readonly header: string | null
  readonly nonBlankCells: number
  readonly distinctValues: number
  /** Date formats consistent with every readable cell; empty when not dates. */
  readonly dateFormats: readonly DateFormat[]
  /** Every non-blank cell reads as an amount. */
  readonly readsAsAmount: boolean
  /** Every non-blank cell is the same — a statement date, or a constant code. */
  readonly constant: boolean
  /** No two non-blank cells repeat: the shape an issuer transaction id has. */
  readonly unique: boolean
}

export type HeaderVerdict = 'header' | 'data' | 'ambiguous'

/**
 * Whether the first record names the columns or is a transaction.
 *
 * HSBC UK and some Santander exports have no header at all, so treating row
 * one as labels silently discards a real charge — and it is the oldest row, so
 * it is the least likely to be noticed missing.
 *
 * The signal is disagreement, not vocabulary: if the first row reads as dates
 * or amounts where later rows do, it is data. If later rows read as dates or
 * amounts where the first does not, it is a header. When neither holds there
 * is nothing to go on, and the importer must ask.
 */
export function detectHeaderRow(rows: readonly CsvRow[], format: AmountFormat): HeaderVerdict {
  const usable = rows.filter((r) => !isBlankRow(r))
  const first = usable[0]
  const rest = usable.slice(1)
  if (first === undefined || rest.length === 0) return 'ambiguous'

  const typedInFirst = first.fields.filter((f) => readsAsTyped(f, format)).length
  const typedInRest = rest.filter((r) => r.fields.some((f) => readsAsTyped(f, format))).length

  // A row of labels holds no dates and no amounts; the rows beneath it do.
  if (typedInFirst === 0 && typedInRest === rest.length) return 'header'
  // The first row is shaped like the ones below it, so it is one of them.
  if (typedInFirst > 0 && typedInRest === rest.length) return 'data'
  return 'ambiguous'
}

function readsAsTyped(value: string, format: AmountFormat): boolean {
  if (value.length === 0) return false
  if (parseAmountToCents(value, format).ok) return true
  return dateFormatCandidates([value]).length > 0
}

export interface ProfileInput {
  readonly rows: readonly CsvRow[]
  readonly hasHeader: boolean
  readonly amountFormat: AmountFormat
}

/**
 * Describe every column of a file.
 *
 * Width is the widest record seen, not the header's width: a column that only
 * ragged rows reach still has to be visible, or the importer cannot explain
 * why those rows were rejected.
 */
export function profileColumns(input: ProfileInput): readonly ColumnProfile[] {
  const records = input.rows.filter((r) => !isBlankRow(r))
  const headerRow = input.hasHeader ? records[0] : undefined
  const dataRows = input.hasHeader ? records.slice(1) : records

  const width = records.reduce((w, r) => Math.max(w, r.fields.length), 0)
  const profiles: ColumnProfile[] = []

  for (let index = 0; index < width; index++) {
    const cells = dataRows.map((r) => r.fields[index] ?? '')
    const nonBlank = cells.filter((c) => c.length > 0)
    const distinct = new Set(nonBlank).size

    profiles.push({
      index,
      header: headerRow?.fields[index] ?? null,
      nonBlankCells: nonBlank.length,
      distinctValues: distinct,
      dateFormats: dateFormatCandidates(cells),
      // Every populated cell must read as money. One that does not means the
      // column is something else that merely contains numbers.
      readsAsAmount:
        nonBlank.length > 0 &&
        nonBlank.every((c) => parseAmountToCents(c, input.amountFormat).ok),
      constant: nonBlank.length > 1 && distinct === 1,
      unique: nonBlank.length > 1 && distinct === nonBlank.length,
    })
  }
  return profiles
}

/**
 * Whether `balance` is a running balance explained by `amount`.
 *
 * A balance column reads as money as convincingly as the amount column does,
 * and on some exports more so — it is never blank and never zero. Picking it
 * as the amount imports the account balance as the price of every purchase.
 *
 * Header text cannot be trusted to separate them, so this checks the defining
 * arithmetic instead: consecutive balances differ by the transaction between
 * them. Sign is tried both ways, because exports disagree about direction and
 * about whether rows run oldest-first or newest-first.
 */
export function explainsAsRunningBalance(
  balanceCells: readonly string[],
  amountCells: readonly string[],
  format: AmountFormat,
): boolean {
  if (balanceCells.length < 3 || balanceCells.length !== amountCells.length) return false

  // Converted up front, so a cell that does not read as money answers "no"
  // rather than contributing a zero. A fallback to 0 on a money path would
  // make an unreadable column look like a perfect match.
  const balances = toCents(balanceCells, format)
  const amounts = toCents(amountCells, format)
  if (balances === null || amounts === null) return false

  // Four readings, because exports disagree on two independent axes. Rows may
  // run oldest-first, where a balance moves by the transaction on its own row,
  // or newest-first, where it moves by the transaction on the row above; and
  // the amount column may be signed either way.
  for (const offset of [0, 1]) {
    for (const direction of [1, -1]) {
      let holds = true
      for (let i = 1; i < balances.length; i++) {
        const previous = balances[i - 1]
        const current = balances[i]
        const movement = amounts[i - offset]
        if (previous === undefined || current === undefined || movement === undefined) {
          holds = false
          break
        }
        if (current - previous !== direction * movement) {
          holds = false
          break
        }
      }
      if (holds) return true
    }
  }
  return false
}

/** Every cell as cents, or null if any cell is not money. */
function toCents(cells: readonly string[], format: AmountFormat): number[] | null {
  const out: number[] = []
  for (const cell of cells) {
    const parsed = parseAmountToCents(cell, format)
    if (!parsed.ok) return null
    out.push(parsed.value)
  }
  return out
}
