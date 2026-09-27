/**
 * A month as two CSV files (plan A19): its charges, and the Overview's
 * figures. Every amount is the screen's own, through formatPlainAmount, and
 * every figure in the summary is core's monthReport (F36), so a file cannot
 * say something the screen does not. Nothing here adds or compares.
 *
 * The writer, packages/report-export, is fetched only when a download is
 * tapped, so it never weighs on opening Reports. These rows are only the
 * cells; the writer guards any text a spreadsheet would run (N4).
 */
import type { Row } from '@budget/report-export'
import { formatBasisPoints, formatPlainAmount } from '../format.js'
import type { Category, LedgerRow } from '../ledger.js'
import { LIST_HEADING } from '../lists.js'
import { sidesOf, type Reviewed } from './Overview.js'

const amount = (cents: number) => ({ number: formatPlainAmount(cents) })

/** The charges in the days the review covers, oldest first, as the database ordered each day. */
export function chargesCsvRows(report: Reviewed, rows: readonly LedgerRow[], categories: readonly Category[]): Row[] {
  const { from, to } = report.window
  const inMonth = rows.filter((r) => r.posted_on >= from && r.posted_on <= to)
  // The read is newest first; a stable sort by date keeps each day's own order.
  const oldestFirst = [...inMonth].sort((a, b) => (a.posted_on < b.posted_on ? -1 : a.posted_on > b.posted_on ? 1 : 0))
  return [
    ['Date', 'Shop', 'Category', 'List', 'Amount'],
    ...oldestFirst.map((r) => {
      const category = categories.find((c) => c.id === r.category_id)
      return [r.posted_on, r.merchant_raw, category?.name ?? 'a category', category === undefined ? '' : LIST_HEADING[category.kind], amount(r.amount_cents)]
    }),
  ]
}

/**
 * Income, Spent and Saved against last month and the usual month, the share
 * saved, then each Variable category beside last month: the Overview's
 * figures, with a column only where the screen shows one.
 */
export function summaryCsvRows(report: Reviewed, nameOf: (id: string) => string): Row[] {
  const sides = sidesOf(report)
  const last = report.lastMonth.status === 'compared' ? report.lastMonth : null
  const { usual, totals } = report
  const heading = ['Figure', sides.now, ...(last === null ? [] : [sides.before]), ...(usual === null ? [] : ['Your usual month'])]
  const total = (label: string, pick: 'income' | 'spent' | 'saved', now: number): Row => [
    label,
    amount(now),
    ...(last === null ? [] : [amount(last[pick].change.beforeCents)]),
    ...(usual === null ? [] : [amount(usual[pick].beforeCents)]),
  ]
  const blanks = heading.length - 2
  return [
    heading,
    total('Income', 'income', totals.incomeCents),
    total('Spent', 'spent', totals.spentCents),
    total('Saved', 'saved', totals.savedCents),
    ['Share saved', totals.savingsRateBp === null ? 'none' : formatBasisPoints(totals.savingsRateBp), ...Array<string>(blanks).fill('')],
    ...report.pairs.map((p): Row => [nameOf(p.categoryId), amount(p.nowCents), amount(p.beforeCents), ...(usual === null ? [] : [''])]),
  ]
}
