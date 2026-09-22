import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  US_AMOUNT_FORMAT,
  detectHeaderRow,
  profileColumns,
  readStatement,
  tokenizeCsv,
} from '../src/index.js'

/**
 * The whole import path against one deliberately hostile file.
 *
 * Synthetic merchants, per CLAUDE.md — no real export is ever committed. Every
 * awkward shape in it was named by the pre-implementation sweep: a BOM, CRLF
 * line endings, a quoted amount carrying its grouping separator, a delimiter
 * and a doubled quote inside quoted merchants, a multi-line quoted memo, a
 * bare inch mark in an unquoted field, a blank line, a short footer total, an
 * unreadable date, an empty merchant, and a final record with no trailing
 * newline.
 *
 * Unit tests prove each rule. This proves they compose.
 */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'messy-statement.csv')

describe('a messy statement, end to end', () => {
  const text = readFileSync(FIXTURE, 'utf8')
  const tokenized = tokenizeCsv(text, { delimiter: ',' })
  if (!tokenized.ok) throw new Error(`tokenize failed: ${tokenized.failure.kind}`)
  const rows = tokenized.rows

  it('reads the file without refusing it', () => {
    expect(tokenized.ok).toBe(true)
  })

  it('finds the header despite the BOM riding on its first cell', () => {
    expect(detectHeaderRow(rows, US_AMOUNT_FORMAT)).toBe('header')
    expect(rows[0]?.fields[0]).toBe('Date')
  })

  it('profiles the columns it was given', () => {
    const cols = profileColumns({ rows, hasHeader: true, amountFormat: US_AMOUNT_FORMAT })
    expect(cols.map((c) => c.header)).toEqual(['Date', 'Description', 'Amount', 'Reference'])
    expect(cols[0]?.dateFormats).toEqual(['MM/DD/YYYY'])
    expect(cols[3]?.unique).toBe(true)
  })

  const result = readStatement(rows, {
    mapping: {
      dateIndex: 0,
      merchantIndex: 1,
      amountIndex: 2,
      issuerIdIndex: 3,
      sign: { kind: 'signed' },
    },
    amountFormat: US_AMOUNT_FORMAT,
    dateFormat: 'MM/DD/YYYY',
    hasHeader: true,
  })

  it('accounts for every row in the file', () => {
    expect(result.parsed).toBe(result.accepted.length + result.rejected.length)
    expect(result.accepted).toHaveLength(8)
    expect(result.rejected).toHaveLength(3)
    expect(result.blankSkipped).toBe(1)
  })

  it('rejects exactly the three rows that cannot be trusted, and says why', () => {
    expect(result.rejected).toEqual([
      { line: 11, reason: 'unparseable_date' },
      { line: 12, reason: 'missing_merchant' },
      { line: 13, reason: 'row_shape_mismatch' },
    ])
  })

  it('numbers lines past a record that spans two of them', () => {
    // The memo row occupies lines 6 and 7, so the next record starts at 8. A
    // reader that counted records instead of lines would point the user at the
    // wrong line of their file for every rejection after it.
    expect(rows.map((r) => r.line)).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14])
  })

  it('gets the large amount right, which is the case that matters most', () => {
    // Read naively this is -1 cent short of a hundred: "-1" parses as -$1.00.
    const grocery = result.accepted.find((r) => r.merchantRaw === 'GROCERY OUTLET')
    expect(grocery?.amountCents).toBe(-123456)
  })

  it('keeps merchants intact through quoting, escapes and embedded newlines', () => {
    const merchants = result.accepted.map((r) => r.merchantRaw)
    expect(merchants).toContain('WALMART #1234, LUBBOCK TX')
    expect(merchants).toContain('JOE"S CRAB SHACK')
    expect(merchants).toContain('AMAZON MKTPLACE ORDER 112-3456789')
    expect(merchants).toContain('15" PIZZA CO')
    // Trailing padding removed, per docs/divergences.md D4.
    expect(merchants).toContain('COFFEE HOUSE')
  })

  it('does not lose the last record for want of a trailing newline', () => {
    expect(text.endsWith('\n')).toBe(false)
    expect(result.accepted.at(-1)).toMatchObject({
      merchantRaw: 'LAST CHARGE NO NEWLINE',
      amountCents: -333,
    })
  })

  it('keeps a refund positive and a purchase negative', () => {
    const refund = result.accepted.find((r) => r.merchantRaw === 'REFUND DEPOT')
    expect(refund?.amountCents).toBe(5000)
    expect(result.accepted.filter((r) => r.amountCents < 0)).toHaveLength(7)
  })

  it('carries each issuer transaction id through to the dedupe key', () => {
    expect(result.accepted.map((r) => r.issuerTransactionId)).toEqual([
      'TXN-001',
      'TXN-002',
      'TXN-003',
      'TXN-004',
      'TXN-005',
      'TXN-006',
      'TXN-007',
      'TXN-010',
    ])
  })
})
