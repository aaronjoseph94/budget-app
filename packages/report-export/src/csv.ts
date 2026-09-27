/**
 * A CSV file from rows the app has already formatted (plan §7, A19).
 *
 * Nothing here computes or formats a figure: an amount arrives as the text
 * the app's formatter wrote, so the file says what the screen says.
 *
 * A plain string is a text cell. A spreadsheet runs a cell starting with
 * `=`, `+`, `-` or `@` as a formula, and a tab or carriage return first can
 * hide one; a shop's name is whatever the shop chose, so every text cell
 * starting with one of those gets a leading apostrophe, which the
 * spreadsheet reads as "this is text" (N4). The guard is here, at the point
 * of export, and not on the way in, where it would change the merchant text
 * the dedupe hash and the shop rules are worked over.
 *
 * An amount is a number cell, `{ number: '-32.74' }`, and is not guarded,
 * since a minus sign is how a negative amount starts. So that this is not a
 * way round the guard, a number cell must be a plain decimal and nothing
 * else, or the file is refused.
 */
export type Cell = string | { readonly number: string }
export type Row = readonly Cell[]

const FORMULA_START = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/
const NEEDS_QUOTES = /[",\r\n]/

function cellText(cell: Cell): string {
  if (typeof cell !== 'string') {
    if (!PLAIN_NUMBER.test(cell.number)) throw new RangeError('A number cell must be a plain decimal such as -32.74')
    return cell.number
  }
  const guarded = FORMULA_START.test(cell) ? `'${cell}` : cell
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded
}

/** Rows as RFC 4180 text: commas between cells, CR LF after each row. */
export function toCsv(rows: readonly Row[]): string {
  return rows.map((row) => `${row.map(cellText).join(',')}\r\n`).join('')
}
