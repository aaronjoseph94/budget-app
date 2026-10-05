import { describe, expect, it } from 'vitest'
import { US_AMOUNT_FORMAT, detectHeaderRow, profileColumns, proposeMapping, tokenizeCsv } from '../src/index.js'

/**
 * Which column is which in a CSV export, as the import screen first offers
 * it (architecture-c2-01). Every file below is invented; the layouts are the
 * shapes card exports take.
 */
const propose = (lines: readonly string[]) => {
  const out = tokenizeCsv(lines.join('\n'), { delimiter: ',' })
  if (!out.ok) throw new Error(out.failure.kind)
  const hasHeader = detectHeaderRow(out.rows, US_AMOUNT_FORMAT) !== 'data'
  const columns = profileColumns({ rows: out.rows, hasHeader, amountFormat: US_AMOUNT_FORMAT })
  return proposeMapping({ rows: out.rows, hasHeader, columns, amountFormat: US_AMOUNT_FORMAT })
}

describe('proposeMapping', () => {
  it('reads the plain three-column file', () => {
    const p = propose(['Date,Description,Amount', '09/02/2026,CORNER MARKET,-42.10', '09/13/2026,LITWARE BOOKS,-19.99', '09/24/2026,CORNER MARKET,-8.00'])
    expect(p).toEqual({ dateIndex: 0, merchantIndex: 1, amountIndex: 2, dateFormats: ['MM/DD/YYYY'], amountCandidates: [2] })
  })

  const CARD = (card: string) => [
    'Transaction Date,Posted Date,Card No.,Description,Amount',
    `09/02/2026,09/03/2026,${card},CORNER MARKET,-42.10`,
    `09/03/2026,09/04/2026,${card},LITWARE BOOKS,-19.99`,
    `09/05/2026,09/08/2026,${card},CORNER MARKET,-8.00`,
    `09/07/2026,09/08/2026,${card},FABRIKAM FUEL,-60.25`,
  ]

  it('never offers a masked card number, the same on every row, as the shop', () => {
    const p = propose(CARD('****1234'))
    expect([p.dateIndex, p.merchantIndex, p.amountIndex]).toEqual([0, 3, 4])
  })

  it('never offers a bare card number, which reads as money, as the amount', () => {
    const p = propose(CARD('1234'))
    expect([p.dateIndex, p.merchantIndex, p.amountIndex]).toEqual([0, 3, 4])
    expect(p.amountCandidates).toEqual([4])
  })

  it('never offers a column that is the same on every row as the shop, even when the shop never repeats', () => {
    const p = propose(['Date,Card,Where,Amount', '09/02/2026,****1234,CORNER MARKET,-42.10', '09/13/2026,****1234,LITWARE BOOKS,-19.99', '09/24/2026,****1234,FABRIKAM FUEL,-8.00'])
    expect(p.merchantIndex).toBe(2)
  })

  // Testing fuzz-08: with every row at one shop, the Description column was
  // the same on every row and was dropped, and the card numbers, which
  // differed, became every row's shop.
  it.each([
    ['two masked cards', ['Date,Description,Amount,Card', '01/02/2025,COFFEE CO,4.50,****1234', '01/03/2025,COFFEE CO,5.25,****5678']],
    ['two full card numbers', ['Date,Description,Amount,Card', '01/02/2025,COFFEE CO,4.50,4111111111111111', '01/03/2025,COFFEE CO,5.25,5500000000000004']],
    ['three rows on two cards', ['Date,Description,Card No.,Amount', '01/02/2025,AMAZON MKTPLACE,****1234,-4.50', '01/03/2025,AMAZON MKTPLACE,****5678,-5.25', '01/04/2025,AMAZON MKTPLACE,****1234,-9.99']],
  ])('keeps the shop column a header names, every row at one shop, over %s', (_, lines) => {
    expect(propose(lines).merchantIndex).toBe(1)
  })

  it('still never offers a cardholder name, the same on every row, over a shop column no header names', () => {
    const p = propose(['Date,Cardholder Name,Where,Amount', '09/02/2026,A PERSON,CORNER MARKET,-42.10', '09/13/2026,A PERSON,LITWARE BOOKS,-19.99', '09/24/2026,A PERSON,CORNER MARKET,-8.00'])
    expect(p.merchantIndex).toBe(2)
  })

  it('drops a running balance explained by another money column', () => {
    // The balance is never blank and has cents too; it moves by each Amount.
    const p = propose([
      'Date,Description,Balance,Amount',
      '09/01/2026,PAYROLL,1000.00,1000.00',
      '09/02/2026,CORNER MARKET,957.90,-42.10',
      '09/03/2026,LITWARE BOOKS,937.91,-19.99',
      '09/04/2026,CORNER MARKET,929.91,-8.00',
    ])
    expect(p.amountIndex).toBe(3)
    expect(p.amountCandidates).toEqual([3])
  })

  it('prefers money with cents over a whole-number column', () => {
    const p = propose(['Date,Ref,Description,Value', '09/02/2026,1001,CORNER MARKET,-42.10', '09/03/2026,1002,LITWARE BOOKS,-19.99', '09/04/2026,1003,CORNER MARKET,-8.00'])
    expect(p.amountIndex).toBe(3)
    expect(p.amountCandidates).toEqual([3, 1])
  })

  it('breaks a tie between money columns by the header, and names both', () => {
    const p = propose(['Date,Description,Fee,Amount', '09/02/2026,CORNER MARKET,1.50,-42.10', '09/03/2026,LITWARE BOOKS,0.75,-19.99', '09/04/2026,CORNER MARKET,2.25,-8.00'])
    expect(p.amountIndex).toBe(3)
    expect(p.amountCandidates).toEqual([3, 2])
  })

  it('takes a description by its header over a column with more repeats', () => {
    const p = propose(['Date,Type,Merchant Name,Amount', '09/02/2026,SALE,CORNER MARKET,-42.10', '09/03/2026,SALE,LITWARE BOOKS,-19.99', '09/04/2026,RETURN,CORNER MARKET,8.00'])
    expect(p.merchantIndex).toBe(2)
  })

  it('takes the text column with the most different values when no header names one', () => {
    const p = propose(['Date,Type,Where,Amount', '09/02/2026,SALE,CORNER MARKET,-42.10', '09/03/2026,SALE,LITWARE BOOKS,-19.99', '09/04/2026,RETURN,CORNER MARKET,8.00', '09/05/2026,SALE,FABRIKAM FUEL,-60.25'])
    expect(p.merchantIndex).toBe(2)
  })

  it('proposes nothing it cannot find, rather than a column by position', () => {
    const p = propose(['Name,Note', 'a,b', 'c,d'])
    expect([p.dateIndex, p.amountIndex, p.amountCandidates]).toEqual([null, null, []])
  })
})
