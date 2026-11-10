import { describe, expect, it } from 'vitest'
import { US_AMOUNT_FORMAT, dropPreamble, readStatement, tokenizeCsv } from '../src/index.js'

/**
 * Lines a bank prints above the table: "Account: …", "Statement period:
 * …", a blank. The first of them was taken as the heading, so every
 * transaction under it had a different number of columns and was refused.
 * Invented shops.
 */
const rowsOf = (lines: readonly string[]) => {
  const out = tokenizeCsv(lines.join('\n'), { delimiter: ',' })
  if (!out.ok) throw new Error(out.failure.kind)
  return out.rows
}

const TABLE = ['Date,Description,Amount', '2026-10-01,CORNER MARKET,-4.50', '2026-10-02,LITWARE BOOKS,-45.10', '2026-10-03,FABRIKAM FUEL,-3.00']

const read = (lines: readonly string[]) => {
  const table = dropPreamble(rowsOf(lines))
  const r = readStatement(table.rows, {
    mapping: { dateIndex: 0, merchantIndex: 1, amountIndex: 2, sign: { kind: 'signed' } },
    amountFormat: US_AMOUNT_FORMAT,
    dateFormat: 'YYYY-MM-DD',
    hasHeader: true,
  })
  return { ...r, skipped: table.skipped }
}

describe('dropPreamble', () => {
  it('leaves a file with no lines above its table as it is', () => {
    const rows = rowsOf(TABLE)
    expect(dropPreamble(rows)).toEqual({ rows, skipped: 0 })
    const headerless = rowsOf(TABLE.slice(1))
    expect(dropPreamble(headerless)).toEqual({ rows: headerless, skipped: 0 })
  })

  it.each([1, 2, 3, 4, 5])('skips %i lines above the table, and reads every transaction', (n) => {
    const above = ['Account: Main Card ****1234', 'Statement period: 1 Oct 2026 - 31 Oct 2026', 'Exported', 'Currency: CAD', 'Page 1'].slice(0, n)
    const r = read([...above, '', ...TABLE])
    expect(r.skipped).toBe(n)
    expect(r.accepted.map((a) => a.merchantRaw)).toEqual(['CORNER MARKET', 'LITWARE BOOKS', 'FABRIKAM FUEL'])
    expect(r.rejected).toEqual([])
    expect([r.parsed, r.blankSkipped]).toEqual([3, 1])
  })

  it('skips lines above the table that hold commas, but not as many as the table', () => {
    const r = read(['Account,Main Card ****1234', '"Period: 1 Oct, 2026 - 31 Oct, 2026"', ...TABLE])
    expect(r.skipped).toBe(2)
    expect(r.accepted).toHaveLength(3)
  })

  it('keeps a closing line under the table as a refused row, in the counts', () => {
    const r = read(['Account: Main Card ****1234', ...TABLE, 'End of statement'])
    expect(r.skipped).toBe(1)
    expect(r.accepted).toHaveLength(3)
    expect(r.rejected).toEqual([{ line: 6, reason: 'row_shape_mismatch' }])
    expect(r.parsed).toBe(r.accepted.length + r.rejected.length)
  })

  it('keeps blank lines, so they are still counted', () => {
    const table = dropPreamble(rowsOf(['Account: Main Card', '', ...TABLE]))
    expect(table.rows.map((r) => r.line)).toEqual([2, 3, 4, 5, 6])
  })
})
