import { describe, expect, it } from 'vitest'
import { US_AMOUNT_FORMAT, detectHeaderRow, profileColumns, proposeMapping, readStatement, tokenizeCsv } from '../src/index.js'

/**
 * A statement that writes money out and money in as two columns, and one
 * whose single column writes purchases as positives. Invented shops.
 *
 * The first was read with Amount set to "Debit" and purchases taken as
 * negative: every purchase became money in, and every row whose money sat in
 * the Credit column was refused for having no amount.
 */
const rowsOf = (lines: readonly string[]) => {
  const out = tokenizeCsv(lines.join('\n'), { delimiter: ',' })
  if (!out.ok) throw new Error(out.failure.kind)
  return out.rows
}

const propose = (lines: readonly string[]) => {
  const rows = rowsOf(lines)
  const hasHeader = detectHeaderRow(rows, US_AMOUNT_FORMAT) !== 'data'
  const columns = profileColumns({ rows, hasHeader, amountFormat: US_AMOUNT_FORMAT })
  return proposeMapping({ rows, hasHeader, columns, amountFormat: US_AMOUNT_FORMAT })
}

const TWO_COLUMNS = [
  'Date,Description,Debit,Credit,Balance',
  '2026-10-01,CORNER MARKET,4.50,,995.50',
  '2026-10-02,LITWARE BOOKS,45.10,,950.40',
  '2026-10-03,PAYROLL,,2100.00,3050.40',
  '2026-10-04,FABRIKAM FUEL,3.00,0.00,3047.40',
]

describe('proposeMapping, money out and money in as two columns', () => {
  it('offers the Debit and Credit columns as a pair, and not the balance they explain', () => {
    const p = propose(TWO_COLUMNS)
    expect([p.amountIndex, p.creditIndex]).toEqual([2, 3])
    expect(p.amountCandidates).toEqual([2])
    expect(p.signUnclear).toBe(false)
  })

  it('finds the pair by other names a bank gives them', () => {
    const p = propose(['Date,Details,Paid in,Paid out', '2026-10-01,CORNER MARKET,,4.50', '2026-10-03,PAYROLL,2100.00,', '2026-10-04,LITWARE BOOKS,,3.00'])
    expect([p.amountIndex, p.creditIndex]).toEqual([3, 2])
  })

  it('offers no pair when only one such column exists', () => {
    const p = propose(['Date,Description,Amount', '2026-10-01,CORNER MARKET,-4.50', '2026-10-02,LITWARE BOOKS,-45.10'])
    expect(p.creditIndex).toBeNull()
    expect(p.signKind).toBe('signed')
    expect(p.signUnclear).toBe(false)
  })
})

describe('proposeMapping, which way one amount column is signed', () => {
  it('starts on "purchases are positive" when the column is named Debit and holds no negative', () => {
    const p = propose(['Date,Description,Debit', '2026-10-01,CORNER MARKET,4.50', '2026-10-02,LITWARE BOOKS,45.10'])
    expect([p.amountIndex, p.creditIndex, p.signKind, p.signUnclear]).toEqual([2, null, 'debit_positive', false])
  })

  it('does not guess for a plain Amount column of mostly positives, and says the sign is unclear', () => {
    const p = propose(['Date,Description,Amount', '2026-10-01,CORNER MARKET,4.50', '2026-10-02,LITWARE BOOKS,45.10', '2026-10-03,PAYMENT THANK YOU,-500.00'])
    expect([p.signKind, p.signUnclear]).toEqual(['signed', true])
  })

  it('leaves a column of mostly negatives as signed, with nothing to check', () => {
    const p = propose(['Date,Description,Amount', '2026-10-01,CORNER MARKET,-4.50', '2026-10-02,LITWARE BOOKS,-45.10', '2026-10-03,REFUND,5.00'])
    expect([p.signKind, p.signUnclear]).toEqual(['signed', false])
  })
})

describe('readStatement, money out and money in as two columns', () => {
  const read = (lines: readonly string[]) =>
    readStatement(rowsOf(lines), {
      mapping: { dateIndex: 0, merchantIndex: 1, amountIndex: 2, creditIndex: 3, sign: { kind: 'signed' } },
      amountFormat: US_AMOUNT_FORMAT,
      dateFormat: 'YYYY-MM-DD',
      hasHeader: true,
    })

  it('reads each row as money in less money out, in whole cents', () => {
    const r = read(TWO_COLUMNS)
    expect(r.rejected).toEqual([])
    expect(r.accepted.map((a) => [a.merchantRaw, a.amountCents])).toEqual([
      ['CORNER MARKET', -450],
      ['LITWARE BOOKS', -4_510],
      ['PAYROLL', 210_000],
      ['FABRIKAM FUEL', -300],
    ])
  })

  it('refuses a row with neither amount, and one whose amount cannot be read, each for its reason', () => {
    const r = read(['Date,Description,Debit,Credit', '2026-10-01,CORNER MARKET,,', '2026-10-02,LITWARE BOOKS,abc,', '2026-10-03,PAYROLL,,1.2.3', '2026-10-04,FABRIKAM FUEL,0.29,'])
    expect(r.rejected).toEqual([
      { line: 2, reason: 'missing_amount' },
      { line: 3, reason: 'unparseable_amount' },
      { line: 4, reason: 'unparseable_amount' },
    ])
    expect(r.accepted.map((a) => a.amountCents)).toEqual([-29])
    expect(r.parsed).toBe(r.accepted.length + r.rejected.length)
  })
})
