/**
 * CSV tokenization: bytes of text in, rows of fields out. Nothing more.
 *
 * It does not know what a date or an amount is, and it never rescues a
 * malformed row. Both are deliberate: every "helpful" repair a tokenizer can
 * make — realigning a ragged row, joining a field that looks split, dropping a
 * line it cannot read — silently changes a ledger, and none of them is visible
 * afterwards.
 *
 * A record separator inside a quoted field is DATA. This is why the text is
 * never split into lines first: `"AMAZON MKTPLACE\r\nORDER 112-3456"` is one
 * field of one record, and a line-splitting reader turns it into two records,
 * fabricating a transaction that never happened.
 *
 * WHITESPACE IS TRIMMED FROM EVERY FIELD, quoted or not. This departs from RFC
 * 4180, which treats spaces as content, and it is a frozen input to the dedupe
 * hash — see docs/divergences.md D4. Exports pad columns inconsistently between
 * downloads, and untrimmed padding means the same charge hashes differently on
 * re-import and lands in the ledger twice.
 */
/** Excel writes this at the start of a UTF-8 file; it would ride on header 1. */
const BOM = '﻿'

/**
 * Bounds that fail loudly rather than truncate. A reader that stops early on a
 * large file reports a clean import of half a statement, and the missing half
 * is invisible — worse than refusing the file.
 */
export const MAX_ROWS = 1_000_000
export const MAX_FIELD_CHARS = 64 * 1024

/**
 * Why a whole file could not be read.
 *
 * Distinct from a row-level rejection: these are structural, so no per-row
 * queue entry can exist to carry them, and the import produces no rows at all
 * rather than a partial batch whose counts would balance while being wrong.
 *
 * Carries a line number and never any content — a failure is a thing that gets
 * logged, and CLAUDE.md permits ids and counts only.
 */
export type CsvFailure =
  | { readonly kind: 'unterminated_quote'; readonly line: number }
  | { readonly kind: 'text_after_closing_quote'; readonly line: number }
  | { readonly kind: 'too_many_rows'; readonly limit: number }
  | { readonly kind: 'field_too_large'; readonly line: number; readonly limit: number }
  | { readonly kind: 'invalid_delimiter' }

export interface CsvRow {
  /** 1-based line where the record starts, for an actionable review-queue entry. */
  readonly line: number
  readonly fields: readonly string[]
}

export type TokenizeOutcome =
  | { readonly ok: true; readonly rows: readonly CsvRow[] }
  | { readonly ok: false; readonly failure: CsvFailure }

export interface CsvOptions {
  /**
   * Declared, never sniffed — the same discipline as the date format and the
   * decimal separator. A European export is semicolon-delimited *because* the
   * comma is its decimal separator, so guessing wrong does not merely misread
   * a column, it changes every amount.
   */
  readonly delimiter: string
}

export function tokenizeCsv(text: string, options: CsvOptions): TokenizeOutcome {
  const d = options.delimiter
  if (d.length !== 1 || d === '"' || d === '\r' || d === '\n') {
    return { ok: false, failure: { kind: 'invalid_delimiter' } }
  }

  const src = text.startsWith(BOM) ? text.slice(1) : text
  const rows: CsvRow[] = []
  let fields: string[] = []
  let field = ''
  let line = 1
  let rowLine = 1
  let started = false // whether any character has been consumed for this record
  let i = 0

  const endField = (): void => {
    fields.push(normalizeField(field))
    field = ''
  }
  const endRecord = (): void => {
    endField()
    rows.push({ line: rowLine, fields })
    fields = []
    started = false
  }

  while (i < src.length) {
    const ch = src.charAt(i)

    if (!started) {
      rowLine = line
      started = true
    }

    // A field is quoted only if its first non-blank character is a quote.
    // `15" PIZZA CO` therefore keeps its inch mark as a literal, while
    // Excel's `, "VALUE"` is still read as quoted.
    if (field === '' && isPadding(ch, d)) {
      const next = skipPadding(src, i, d)
      if (src[next] === '"') {
        i = next
        continue
      }
    }

    if (field === '' && ch === '"') {
      const quoted = readQuoted(src, i + 1, line)
      if (!quoted.ok) return { ok: false, failure: quoted.failure }
      if (quoted.value.length > MAX_FIELD_CHARS) {
        return { ok: false, failure: { kind: 'field_too_large', line, limit: MAX_FIELD_CHARS } }
      }
      field = quoted.value
      line = quoted.line
      i = skipPadding(src, quoted.next, d)

      const after = src[i]
      if (after === undefined) break
      if (after === d) {
        endField()
        i++
        continue
      }
      if (after === '\r' || after === '\n') {
        i = consumeNewline(src, i)
        endRecord()
        line++
        // Checked here too: a file whose every record ends in a quoted field
        // never reaches the unquoted newline branch below, so the bound was
        // unenforced on exactly the input most likely to be enormous.
        if (rows.length > MAX_ROWS) {
          return { ok: false, failure: { kind: 'too_many_rows', limit: MAX_ROWS } }
        }
        continue
      }
      return { ok: false, failure: { kind: 'text_after_closing_quote', line } }
    }

    if (ch === d) {
      endField()
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      i = consumeNewline(src, i)
      endRecord()
      line++
      if (rows.length > MAX_ROWS) {
        return { ok: false, failure: { kind: 'too_many_rows', limit: MAX_ROWS } }
      }
      continue
    }

    field += ch
    i++
    if (field.length > MAX_FIELD_CHARS) {
      return { ok: false, failure: { kind: 'field_too_large', line, limit: MAX_FIELD_CHARS } }
    }
  }

  // Flush a final record that ended at EOF rather than at a newline. Guarded on
  // `started`, so a file ending in a newline does not gain a phantom empty row.
  if (started) endRecord()

  if (rows.length > MAX_ROWS) {
    return { ok: false, failure: { kind: 'too_many_rows', limit: MAX_ROWS } }
  }
  return { ok: true, rows }
}

/**
 * Collapse every run of whitespace to one space, then trim. See D4.
 *
 * The collapse exists for the line break inside a quoted field. Amex extended
 * details and several UK exports put a multi-line memo in the merchant column,
 * and that is a real transaction, not a malformed one — but a merchant
 * descriptor is a single-line field, and `IngestedTextSchema` rejects control
 * characters precisely because text that renders across lines can push content
 * out of a reviewer's view. Rejecting the charge over its formatting would send
 * a legitimate purchase to the queue every month.
 *
 * It also stabilises the dedupe hash: the same memo arrives CRLF-separated in
 * one download and LF-separated in the next, and an unnormalized field hashes
 * those as two different charges.
 *
 * This neutralizes only whitespace. The bidi overrides and isolates are not
 * whitespace, so a descriptor that displays differently than it is stored still
 * reaches the schema's guard and is still refused.
 */
function normalizeField(raw: string): string {
  return raw.replace(/\s+/gu, ' ').trim()
}

/**
 * Whether a character is padding around a field rather than part of it.
 *
 * THE DELIMITER IS NEVER PADDING, whatever it looks like. Tab is a supported
 * delimiter, and treating it as padding meant a tab-separated file with any
 * quoted field was refused outright: the skip ran past the delimiter, landed
 * on the next field, and reported text after a closing quote.
 *
 * The whitespace set matches `normalizeField` exactly. When it did not, a
 * non-breaking space before an opening quote left the field looking non-empty,
 * so quoting never engaged and the quotes became merchant content — and then
 * the normalizer trimmed the padding away, erasing the evidence. A record
 * separator is never padding either; it ends the record.
 */
const WHITESPACE = /\s/u

function isPadding(ch: string, delimiter: string): boolean {
  if (ch.length === 0 || ch === delimiter) return false
  if (ch === '\r' || ch === '\n') return false
  return WHITESPACE.test(ch)
}

function skipPadding(src: string, from: number, delimiter: string): number {
  let i = from
  while (isPadding(src.charAt(i), delimiter)) i++
  return i
}

/** Consume CRLF, LF or a lone CR (Excel for Macintosh) as one terminator. */
function consumeNewline(src: string, at: number): number {
  if (src[at] === '\r' && src[at + 1] === '\n') return at + 2
  return at + 1
}

type QuotedRead =
  | { readonly ok: true; readonly value: string; readonly next: number; readonly line: number }
  | { readonly ok: false; readonly failure: CsvFailure }

/**
 * Read a quoted field, starting just past its opening quote.
 *
 * `""` inside is one literal quote, so `"ACME ""FRESH"""` is `ACME "FRESH"` —
 * the three quotes at the end are an escaped quote followed by the terminator.
 * Separators inside are ordinary characters and are preserved exactly.
 */
function readQuoted(src: string, from: number, startLine: number): QuotedRead {
  let value = ''
  let line = startLine
  let i = from

  while (i < src.length) {
    const ch = src.charAt(i)
    if (ch === '"') {
      if (src[i + 1] === '"') {
        value += '"'
        i += 2
        continue
      }
      return { ok: true, value, next: i + 1, line }
    }
    if (ch === '\n') line++
    if (ch === '\r' && src[i + 1] !== '\n') line++
    value += ch
    i++
    if (value.length > MAX_FIELD_CHARS) {
      return { ok: false, failure: { kind: 'field_too_large', line, limit: MAX_FIELD_CHARS } }
    }
  }
  // Running out of input inside quotes means every remaining line was swallowed
  // into this one field. Refusing the file is the only honest outcome.
  return { ok: false, failure: { kind: 'unterminated_quote', line: startLine } }
}

/** A row whose every field is empty: a blank line, or a line of only delimiters. */
export function isBlankRow(row: CsvRow): boolean {
  return row.fields.every((f) => f.length === 0)
}
