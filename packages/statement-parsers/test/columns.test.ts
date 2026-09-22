import { describe, expect, it } from 'vitest'
import {
  US_AMOUNT_FORMAT,
  detectHeaderRow,
  explainsAsRunningBalance,
  profileColumns,
  tokenizeCsv,
  type CsvRow,
} from '../src/index.js'

const rowsOf = (text: string): readonly CsvRow[] => {
  const out = tokenizeCsv(text, { delimiter: ',' })
  if (!out.ok) throw new Error(`tokenize failed: ${out.failure.kind}`)
  return out.rows
}

const profile = (text: string, hasHeader = true) =>
  profileColumns({ rows: rowsOf(text), hasHeader, amountFormat: US_AMOUNT_FORMAT })

describe('detectHeaderRow', () => {
  it('recognises a header row by its disagreement with the rows below', () => {
    const rows = rowsOf('Date,Description,Amount\n03/04/2025,COFFEE,-4.50\n03/05/2025,GAS,-40.00')
    expect(detectHeaderRow(rows, US_AMOUNT_FORMAT)).toBe('header')
  })

  it('recognises a headerless export, where row one is a real charge', () => {
    // HSBC UK and some Santander exports have no header. Treating row one as
    // labels discards a real transaction — the oldest one, least likely to be
    // missed.
    const rows = rowsOf('03/04/2025,COFFEE,-4.50\n03/05/2025,GAS,-40.00')
    expect(detectHeaderRow(rows, US_AMOUNT_FORMAT)).toBe('data')
  })

  it('refuses to decide when there is nothing to go on', () => {
    expect(detectHeaderRow(rowsOf('a,b,c'), US_AMOUNT_FORMAT)).toBe('ambiguous')
    expect(detectHeaderRow([], US_AMOUNT_FORMAT)).toBe('ambiguous')
    expect(detectHeaderRow(rowsOf('a,b\nc,d'), US_AMOUNT_FORMAT)).toBe('ambiguous')
  })
})

describe('profileColumns addresses columns by index', () => {
  it('keeps two identically-named columns as separate columns', () => {
    // Keyed by header, one of these disappears and the user maps the wrong one
    // — importing a running balance as the transaction amount.
    const cols = profile('Amount,Amount\n-4.50,1203.55\n-40.00,1163.55')
    expect(cols).toHaveLength(2)
    expect(cols.map((c) => c.index)).toEqual([0, 1])
    expect(cols.map((c) => c.header)).toEqual(['Amount', 'Amount'])
  })

  it('survives a column named __proto__ without losing it', () => {
    // As an object key this does not create a property; the column vanishes,
    // and every column after it shifts in the user's mapping.
    const cols = profile('__proto__,constructor,Amount\nx,y,-4.50\np,q,-9.00')
    expect(cols).toHaveLength(3)
    expect(cols[0]?.header).toBe('__proto__')
    expect(cols[2]?.readsAsAmount).toBe(true)
  })

  it('profiles a headerless file with null headers', () => {
    const cols = profile('03/04/2025,COFFEE,-4.50\n03/05/2025,GAS,-40.00', false)
    expect(cols.map((c) => c.header)).toEqual([null, null, null])
    expect(cols[0]?.dateFormats).toContain('MM/DD/YYYY')
  })

  it('widens to the widest record, so a ragged row stays explainable', () => {
    const cols = profile('Date,Amount\n03/04/2025,-4.50\n03/05/2025,EXTRA,-9.00')
    expect(cols).toHaveLength(3)
  })
})

describe('profileColumns describes what a column holds', () => {
  const cols = profile(
    [
      'Date,Merchant,Amount,Ref,Statement',
      '03/13/2025,COFFEE,-4.50,TXN-1,03/31/2025',
      '03/14/2025,GAS,-40.00,TXN-2,03/31/2025',
      '03/15/2025,COFFEE,-4.50,TXN-3,03/31/2025',
    ].join('\n'),
  )

  it('identifies a date column and the formats it could be', () => {
    expect(cols[0]?.dateFormats).toEqual(['MM/DD/YYYY'])
  })

  it('reports BOTH date formats when the column cannot settle it', () => {
    // Every day 12 or lower, so no number of rows distinguishes MM/DD from
    // DD/MM. Naming one would be a guess; the importer asks instead.
    const ambiguous = profile('Date,Amount\n03/04/2025,-4.50\n01/02/2025,-9.00')
    expect(ambiguous[0]?.dateFormats).toEqual(['MM/DD/YYYY', 'DD/MM/YYYY'])
  })

  it('identifies an amount column, and does not mistake text for one', () => {
    expect(cols[2]?.readsAsAmount).toBe(true)
    expect(cols[1]?.readsAsAmount).toBe(false)
  })

  it('flags a unique column, the shape an issuer transaction id has', () => {
    expect(cols[3]?.unique).toBe(true)
    // A merchant repeats, so it can never be a transaction id.
    expect(cols[1]?.unique).toBe(false)
  })

  it('flags a constant column, which a statement date is and a posting date is not', () => {
    // Mapped as the transaction date, every row lands on the same day and the
    // weekly view — the app's primary lens — is wrong for the whole import.
    expect(cols[4]?.constant).toBe(true)
    expect(cols[0]?.constant).toBe(false)
  })

  it('does not call a single-row column unique or constant', () => {
    // One observation is not evidence of either.
    const one = profile('Date,Ref\n03/04/2025,TXN-1')
    expect(one[1]?.unique).toBe(false)
    expect(one[1]?.constant).toBe(false)
  })

  it('ignores blank cells when judging a column', () => {
    const cols2 = profile('Date,Amount\n03/04/2025,-4.50\n03/05/2025,\n03/06/2025,-9.00')
    expect(cols2[1]?.readsAsAmount).toBe(true)
    expect(cols2[1]?.nonBlankCells).toBe(2)
  })
})

describe('explainsAsRunningBalance', () => {
  const amounts = ['-4.50', '-40.00', '-9.00', '-1.50']

  it('recognises a balance column by the arithmetic, not the header', () => {
    // A balance reads as money at least as convincingly as the amount column
    // — it is never blank and never zero — so any "looks like money" heuristic
    // prefers it, and mapping it imports the account balance as every price.
    const balances = ['1000.00', '960.00', '951.00', '949.50']
    expect(explainsAsRunningBalance(balances, amounts, US_AMOUNT_FORMAT)).toBe(true)
  })

  it('recognises it when the file runs newest-first', () => {
    const balances = ['949.50', '951.00', '960.00', '1000.00']
    const reversed = ['-1.50', '-9.00', '-40.00', '-4.50']
    expect(explainsAsRunningBalance(balances, reversed, US_AMOUNT_FORMAT)).toBe(true)
  })

  it('does not accuse an ordinary second amount column', () => {
    // A foreign-currency or fee column is money too, but its values do not
    // explain the movement between rows.
    const fees = ['-0.25', '-1.00', '-0.30', '-0.10']
    expect(explainsAsRunningBalance(fees, amounts, US_AMOUNT_FORMAT)).toBe(false)
  })

  it('says no rather than guessing from too few rows', () => {
    expect(explainsAsRunningBalance(['1000.00', '995.50'], ['-4.50', '-4.50'], US_AMOUNT_FORMAT))
      .toBe(false)
  })

  it('says no when a cell is not money, rather than treating it as zero', () => {
    // A fallback to 0 here would make an unreadable column look like a match.
    const balances = ['1000.00', 'n/a', '951.00', '949.50']
    expect(explainsAsRunningBalance(balances, amounts, US_AMOUNT_FORMAT)).toBe(false)
  })

  it('says no when the columns are different lengths', () => {
    expect(explainsAsRunningBalance(['1.00', '2.00', '3.00'], amounts, US_AMOUNT_FORMAT)).toBe(
      false,
    )
  })
})
