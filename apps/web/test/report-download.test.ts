import { describe, expect, it } from 'vitest'
import type { Category, LedgerRow } from '../src/ledger.js'
import { chargesCsvRows, summaryCsvRows } from '../src/reports/download.js'
import { reportOf, type ReportRows } from '../src/reports/read.js'

/**
 * A month's two downloads as rows (plan A19), invented data only: records
 * from 1 July 2026, pay of $4,200.00 each month, Dining out $450.00 then
 * $560.00, and $300.00 then $500.00 to the Flight fund. Worked by hand:
 * August against July, whose one whole month is also the usual month; saved
 * $500.00 of $4,200.00, which is 12% to the whole percent.
 */

const cat = (id: string, name: string, kind: Category['kind']): Category => ({ id, name, kind, sort_order: 0, weekly_budget_cents: null })
const categories = [cat('pay', 'Pay', 'income'), cat('dining', 'Dining out', 'variable'), cat('flight', 'Flight fund', 'savings')]
const row = (id: string, posted_on: string, amount_cents: number, category_id: string, merchant_raw = 'SHOP'): LedgerRow => ({
  id,
  posted_on,
  amount_cents,
  merchant_raw,
  category_id,
  source: 'card_pdf',
})

// As the database hands them over: newest first.
const rows: ReportRows = {
  asOf: '2026-09-24',
  month: '2026-08-01',
  readFrom: '2026-02-01',
  rows: [
    row('t6', '2026-08-15', -50_000, 'flight', 'Transfer to savings'),
    row('t5', '2026-08-10', -56_000, 'dining', '=HYPERLINK("x")'),
    row('t4', '2026-08-05', 420_000, 'pay', 'Payroll, Inc'),
    row('t3', '2026-07-15', -30_000, 'flight'),
    row('t2', '2026-07-10', -45_000, 'dining'),
    row('t1', '2026-07-05', 420_000, 'pay'),
  ],
  plans: [],
  records: { statementStarts: ['2026-07-01'], entryDates: [] },
}

function reviewed() {
  const { report } = reportOf(rows, categories)
  if (!('totals' in report)) throw new Error(report.status)
  return report
}

describe('chargesCsvRows', () => {
  it('lists the month’s charges oldest first, each amount as the screen shows it, the shop’s text untouched', () => {
    expect(chargesCsvRows(reviewed(), rows.rows, categories)).toEqual([
      ['Date', 'Shop', 'Category', 'List', 'Amount'],
      ['2026-08-05', 'Payroll, Inc', 'Pay', 'Income', { number: '4200.00' }],
      ['2026-08-10', '=HYPERLINK("x")', 'Dining out', 'Variable expenses', { number: '-560.00' }],
      ['2026-08-15', 'Transfer to savings', 'Flight fund', 'Savings', { number: '-500.00' }],
    ])
  })

  it('keeps the database’s order within a day, keeps the first and last days, and leaves out a charge outside the month', () => {
    const edges = [
      row('z', '2026-09-01', -300, 'dining'),
      row('y', '2026-08-31', -400, 'dining'),
      row('b', '2026-08-10', -100, 'dining'),
      row('a', '2026-08-10', -200, 'dining'),
      row('x', '2026-08-01', -500, 'dining'),
      row('w', '2026-07-31', -600, 'dining'),
    ]
    const out = chargesCsvRows(reviewed(), edges, categories)
    expect(out.slice(1).map((r) => r[4])).toEqual([{ number: '-5.00' }, { number: '-1.00' }, { number: '-2.00' }, { number: '-4.00' }])
  })

  it('names a category it cannot find, rather than leaving the cell blank', () => {
    const out = chargesCsvRows(reviewed(), [row('x', '2026-08-02', -100, 'gone')], categories)
    expect(out[1]).toEqual(['2026-08-02', 'SHOP', 'a category', '', { number: '-1.00' }])
  })
})

describe('summaryCsvRows', () => {
  it('writes the Overview’s totals against last month and the usual month, then each category beside last month', () => {
    expect(summaryCsvRows(reviewed(), (id) => categories.find((c) => c.id === id)?.name ?? 'a category')).toEqual([
      ['Figure', 'August', 'July', 'Your usual month'],
      ['Income', { number: '4200.00' }, { number: '4200.00' }, { number: '4200.00' }],
      ['Spent', { number: '560.00' }, { number: '450.00' }, { number: '450.00' }],
      ['Saved', { number: '500.00' }, { number: '300.00' }, { number: '300.00' }],
      ['Share saved', '12%', '', ''],
      ['Dining out', { number: '560.00' }, { number: '450.00' }, ''],
    ])
  })

  it('leaves out last month’s and the usual month’s columns when there are none', () => {
    const first: ReportRows = { ...rows, month: '2026-07-01', records: { statementStarts: ['2026-07-01'], entryDates: [] } }
    const { report } = reportOf(first, categories)
    if (!('totals' in report)) throw new Error(report.status)
    expect(summaryCsvRows(report, () => 'x')).toEqual([
      ['Figure', 'July'],
      ['Income', { number: '4200.00' }],
      ['Spent', { number: '450.00' }],
      ['Saved', { number: '300.00' }],
      ['Share saved', '7%'],
    ])
  })

  it('says there is no share saved when nothing came in', () => {
    const noPay: ReportRows = { ...rows, rows: rows.rows.filter((r) => r.category_id !== 'pay') }
    const { report } = reportOf(noPay, categories)
    if (!('totals' in report)) throw new Error(report.status)
    expect(summaryCsvRows(report, () => 'x')[4]).toEqual(['Share saved', 'none', '', ''])
  })
})
