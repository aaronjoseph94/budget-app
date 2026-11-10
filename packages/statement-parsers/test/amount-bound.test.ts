import { describe, expect, it } from 'vitest'
import { MAX_TYPED_CENTS, US_AMOUNT_FORMAT, parseAmountToCents, profileColumns, readStatement, readTypedAmount, tokenizeCsv } from '../src/index.js'
import { parseDebitCredit } from '../src/amount.js'

/**
 * A statement amount stops where a typed one does: $999,999,999.99 (N168).
 *
 * The reader had no upper bound, so a 14-digit reference number chosen as
 * the Amount column, or one absurd row, was read as money. The preview then
 * could not add the rows up and the whole Add screen failed to draw; sent
 * on, such a row broke the month it landed in. Invented shops.
 */
const TOO_LARGE = { ok: false, reason: 'unparseable_amount', detail: 'amount_too_large' }

const rowsOf = (lines: readonly string[]) => {
  const out = tokenizeCsv(lines.join('\n'), { delimiter: ',' })
  if (!out.ok) throw new Error(out.failure.kind)
  return out.rows
}

describe('parseAmountToCents, the most a statement row may carry', () => {
  it('reads the limit itself, either way', () => {
    expect(parseAmountToCents('999,999,999.99', US_AMOUNT_FORMAT)).toEqual({ ok: true, value: MAX_TYPED_CENTS })
    expect(parseAmountToCents('-999999999.99', US_AMOUNT_FORMAT)).toEqual({ ok: true, value: -MAX_TYPED_CENTS })
  })

  it.each(['1000000000.00', '-90071992547409.91', '20261001123450', '99999999999999999999.00', '(1,000,000,000.00)'])(
    'refuses %s as too large, never as a number it cannot hold',
    (text) => {
      expect(parseAmountToCents(text, US_AMOUNT_FORMAT)).toEqual(TOO_LARGE)
    },
  )

  it('still tells a typed amount that is too large from one that is no amount', () => {
    expect(readTypedAmount('1000000000')).toEqual({ ok: false, reason: 'too_large' })
    expect(readTypedAmount('abc')).toEqual({ ok: false, reason: 'not_an_amount' })
  })

  it('holds a credit less a debit to the same limit', () => {
    expect(parseDebitCredit('-999999999.99', '999999999.99', US_AMOUNT_FORMAT)).toEqual(TOO_LARGE)
    expect(parseDebitCredit('1000000000.00', '', US_AMOUNT_FORMAT)).toEqual(TOO_LARGE)
  })
})

describe('a statement with an amount too large to be one', () => {
  const FILE = ['Date,Description,Amount', '2026-10-01,CORNER MARKET,-90071992547409.91', '2026-10-02,LITWARE BOOKS,-45.10', '2026-10-03,FABRIKAM FUEL,-99999999999999999999.00']

  it('refuses those rows with the reason, reads the rest, and the counts balance', () => {
    const r = readStatement(rowsOf(FILE), {
      mapping: { dateIndex: 0, merchantIndex: 1, amountIndex: 2, sign: { kind: 'signed' } },
      amountFormat: US_AMOUNT_FORMAT,
      dateFormat: 'YYYY-MM-DD',
      hasHeader: true,
    })
    expect(r.rejected).toEqual([
      { line: 2, reason: 'unparseable_amount', detail: 'amount_too_large' },
      { line: 4, reason: 'unparseable_amount', detail: 'amount_too_large' },
    ])
    expect(r.accepted.map((a) => a.amountCents)).toEqual([-4_510])
    expect(r.parsed).toBe(r.accepted.length + r.rejected.length)
  })

  it('does not call a column of 14-digit reference numbers money', () => {
    const rows = rowsOf(['Date,Description,Amount,Reference', '2026-10-01,CORNER MARKET,-3.50,20261001123450', '2026-10-02,LITWARE BOOKS,-4.50,20261002123451'])
    const columns = profileColumns({ rows, hasHeader: true, amountFormat: US_AMOUNT_FORMAT })
    expect(columns.map((c) => c.readsAsAmount)).toEqual([false, false, true, false])
  })
})
