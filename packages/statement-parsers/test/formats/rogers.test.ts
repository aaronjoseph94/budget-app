import { describe, expect, it } from 'vitest'
import type { TextRun } from '../../src/pdf/text.js'
import {
  readPeriod,
  readRogersStatement,
  readSummary,
} from '../../src/formats/rogers.js'

const run = (x: number, y: number, text: string): TextRun => ({ x, y, text })

/**
 * The statement period line, at the positions a real statement uses.
 *
 * Split into separate runs exactly as the producer emits it — `Aug`, `8`, `,`,
 * `2026` are four drawn pieces, not one string. A parser tested against a
 * tidy single run would not be tested at all.
 */
const PERIOD_ROW: TextRun[] = [
  run(25.2, 678.78, 'Statement'),
  run(70.8, 678.78, 'Period'),
  run(100.8, 678.78, 'Aug'),
  run(120.24, 678.78, '8'),
  run(124.56, 678.78, ','),
  run(129.84, 678.78, '2026'),
  run(152.64, 678.78, '-'),
  run(158.4, 678.78, 'Sep'),
  run(177.84, 678.78, '7'),
  run(181.92, 678.78, ','),
  run(187.2, 678.78, '2026'),
]

/**
 * The summary block, with the decoys a real page carries.
 *
 * The left half prints a DIFFERENT figure at the same height as each summary
 * label: a minimum payment beside the previous balance, a credit limit beside
 * the new purchases. Taking the first amount on the row rather than the one
 * after the label gives a wrong total that still reconciles against itself.
 *
 * Every figure here is invented, and they balance:
 * previous 500.00 − payments 300.00 + purchases 255.00 = new 455.00.
 */
const SUMMARY_ROWS: TextRun[] = [
  run(25.2, 649.15, 'Minimum'),
  run(68.16, 649.15, 'payment'),
  run(146.88, 649.15, '$14.03'),
  run(181.2, 649.15, 'Previous'),
  run(220.8, 649.15, 'balance'),
  run(334.08, 649.15, '$500.00'),

  run(25.2, 636.44, 'Payment'),
  run(65.76, 636.44, 'due'),
  run(84.48, 636.44, 'date'),
  run(120.0, 636.44, 'Sep'),
  run(139.2, 636.44, '28,'),
  run(154.56, 636.44, '2026'),
  run(181.2, 636.44, 'Payments'),
  run(225.84, 636.44, '&'),
  run(234.72, 636.44, 'credits'),
  run(326.4, 636.44, '$300.00'),

  run(25.2, 623.74, 'Credit'),
  run(53.04, 623.74, 'limit'),
  run(134.16, 623.74, '$5,200.00'),
  run(181.2, 623.74, 'New'),
  run(202.56, 623.74, 'purchases'),
  run(249.12, 623.74, '&'),
  run(258.0, 623.74, 'debits'),
  run(326.4, 623.74, '$255.00'),

  run(181.2, 611.04, 'Cash'),
  run(205.92, 611.04, 'advances'),
  run(334.08, 611.04, '$0.00'),
  run(181.2, 585.64, 'Fees'),
  run(334.08, 585.64, '$0.00'),
  run(181.2, 572.94, 'Interest'),
  run(334.08, 572.94, '$0.00'),
  run(181.2, 556.08, 'New'),
  run(206.64, 556.08, 'Balance'),
  run(334.08, 556.08, '$455.00'),
]

/** One transaction row, at the real column positions. */
function txn(y: number, trans: string, post: string, words: string[], amount: string): TextRun[] {
  const [tm, td] = trans.split(' ')
  const [pm, pd] = post.split(' ')
  const cells: TextRun[] = [
    run(25.68, y, tm ?? ''),
    run(41.52, y, td ?? ''),
    run(59.04, y, pm ?? ''),
    run(74.88, y, pd ?? ''),
  ]
  let x = 95.04
  for (const w of words) {
    cells.push(run(x, y, w))
    x += w.length * 5.6 + 4
  }
  cells.push(run(368.4 - amount.length * 4.32, y, amount))
  return cells
}

const PAGE: TextRun[] = [
  ...PERIOD_ROW,
  ...SUMMARY_ROWS,
  // Table headings: two words where two dates would be. Must not be a row.
  run(27.84, 400, 'Trans'),
  run(59.04, 400, 'Post'),
  run(95.04, 400, 'Description'),
  run(340, 400, 'Amount'),
  // A card-number heading, likewise.
  run(25.2, 390, 'Card'),
  run(48, 390, 'Number'),
  run(95, 390, 'XXXX XXXX XXXX 0472'),
  ...txn(360, 'Aug 6', 'Aug 10', ['NORTHWIND', 'PRESS', 'ANYTOWN', 'BC'], '-45.00'),
  ...txn(349, 'Aug 7', 'Aug 10', ['CORNER', 'SHOP', 'ANYTOWN', 'AB'], '55.00'),
  ...txn(338, 'Aug 9', 'Aug 11', ['CONTOSO', 'DINER', 'ANYTOWN', 'AB'], '200.00'),
  ...txn(327, 'Sep 1', 'Sep 2', ['PAYMENT,', 'THANK', 'YOU'], '-255.00'),
]

describe('the statement period', () => {
  it('reads it from runs the producer split into pieces', () => {
    expect(readPeriod([PERIOD_ROW])).toEqual({ from: '2026-08-08', to: '2026-09-07' })
  })

  it('returns null when the page has no period at all', () => {
    expect(readPeriod([[run(10, 10, 'no period here')]])).toBeNull()
  })

  // A period that is no date, or runs backwards, was returned as one and
  // only refused later by the database (architecture-a-06).
  const periodRow = (text: string) => [text.split(' ').map((word, i) => run(25 + i * 30, 678.78, word))]
  it('returns null for a day the month does not have', () => {
    expect(readPeriod(periodRow('Statement Period Feb 30, 2026 - Mar 7, 2026'))).toBeNull()
  })

  it('returns null for a period that ends before it starts', () => {
    expect(readPeriod(periodRow('Statement Period Feb 3, 2026 - Jan 7, 2026'))).toBeNull()
  })

  it('reads a period across a new year', () => {
    expect(readPeriod(periodRow('Statement Period Dec 8, 2026 - Jan 7, 2027'))).toEqual({ from: '2026-12-08', to: '2027-01-07' })
  })
})

describe('the printed summary', () => {
  it('takes the amount that follows each label, not the first on the row', () => {
    const summary = readSummary([SUMMARY_ROWS])
    expect(summary).not.toBeNull()
    // $14.03 and $5,200.00 sit to the LEFT of their row's real figures.
    expect(summary?.previousBalanceCents).toBe(50_000)
    expect(summary?.purchasesAndDebitsCents).toBe(25_500)
    expect(summary?.paymentsAndCreditsCents).toBe(30_000)
    expect(summary?.newBalanceCents).toBe(45_500)
  })

  it('returns null when a figure is missing rather than defaulting it to zero', () => {
    // A zero stands in for a real figure and reconciles as though the
    // statement said zero, which is how a misread passes.
    const missing = SUMMARY_ROWS.filter((r) => r.text !== 'Interest')
    expect(readSummary([missing])).toBeNull()
  })
})

describe('reading a whole statement', () => {
  it('finds the transactions and ignores the headings around them', () => {
    const out = readRogersStatement([PAGE])
    if (!out.ok) throw new Error(out.failure)

    expect(out.read.parsed).toBe(4)
    expect(out.read.accepted).toHaveLength(4)
    expect(out.read.rejected).toEqual([])
    expect(out.read.accepted.map((a) => a.merchantRaw)).toEqual([
      'NORTHWIND PRESS ANYTOWN BC',
      'CORNER SHOP ANYTOWN AB',
      'CONTOSO DINER ANYTOWN AB',
      'PAYMENT, THANK YOU',
    ])
  })

  it('flips the sign, because the statement and the ledger disagree', () => {
    const out = readRogersStatement([PAGE])
    if (!out.ok) throw new Error(out.failure)

    // Statement: purchase positive, payment negative. Ledger: outflow
    // negative, inflow positive (docs/divergences.md D3).
    expect(out.read.accepted.map((a) => a.amountCents)).toEqual([4_500, -5_500, -20_000, 25_500])
    expect(out.read.statementAmountsCents).toEqual([-4_500, 5_500, 20_000, -25_500])
  })

  it('dates each row from when the purchase was made, not when it settled', () => {
    // The user chose this; docs/formula-decisions.md F1. Aug 6 posted Aug 10
    // is dated the 6th, and its year comes from the period.
    const out = readRogersStatement([PAGE])
    if (!out.ok) throw new Error(out.failure)
    expect(out.read.accepted.map((a) => a.postedOn)).toEqual([
      '2026-08-06',
      '2026-08-07',
      '2026-08-09',
      '2026-09-01',
    ])
  })

  it('reconciles against the summary it read from the same page', () => {
    const out = readRogersStatement([PAGE])
    if (!out.ok) throw new Error(out.failure)
    const { summary, statementAmountsCents } = out.read

    const purchases = statementAmountsCents.filter((a) => a > 0).reduce((a, b) => a + b, 0)
    const payments = -statementAmountsCents.filter((a) => a < 0).reduce((a, b) => a + b, 0)
    expect(purchases).toBe(summary.purchasesAndDebitsCents)
    expect(payments).toBe(summary.paymentsAndCreditsCents)
  })
})

describe('rows it cannot read', () => {
  it('rejects a row with an unreadable amount and still balances the counts', () => {
    // parsed === accepted + rejected is the rule that makes a vanished row
    // impossible, so it has to hold on the failure path too.
    const broken = [...PAGE, ...txn(316, 'Aug 9', 'Aug 11', ['ODD', 'ONE'], 'n/a')]
    const out = readRogersStatement([broken])
    if (!out.ok) throw new Error(out.failure)

    expect(out.read.parsed).toBe(5)
    expect(out.read.rejected).toEqual([{ line: 5, reason: 'unparseable_amount' }])
    expect(out.read.parsed).toBe(out.read.accepted.length + out.read.rejected.length)
  })

  it('rejects a row whose date cannot belong to this statement', () => {
    const stray = [...PAGE, ...txn(316, 'Mar 2', 'Mar 4', ['OLD', 'ONE'], '10.00')]
    const out = readRogersStatement([stray])
    if (!out.ok) throw new Error(out.failure)
    expect(out.read.rejected).toEqual([{ line: 5, reason: 'unparseable_date' }])
  })

  it('refuses the whole file when there is no period to date rows from', () => {
    const out = readRogersStatement([PAGE.filter((r) => r.y !== 678.78)])
    expect(out).toEqual({ ok: false, failure: 'no_statement_period' })
  })

  it('refuses the whole file when the summary is absent', () => {
    // Without it there is nothing to check the import against, and an
    // unverifiable import is the thing this design refuses to produce.
    const out = readRogersStatement([PAGE.filter((r) => r.y > 670 || r.y < 550)])
    expect(out).toEqual({ ok: false, failure: 'no_summary' })
  })
})
