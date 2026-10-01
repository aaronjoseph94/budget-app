/**
 * Which column of a CSV export is the date, the shop and the amount, as the
 * import screen first offers it. The owner can change every choice; this is
 * only where the screen starts (architecture-c2-01).
 *
 * It used to live in the screen's hook, untested, and took the first money
 * column for the amount and the first repeating text column for the shop. A
 * card-number column, the same on every row, then became every row's shop
 * ("****1234") or every row's amount ("1234" reads as money), and save_import
 * files a row whose shop has a learned rule straight into the ledger.
 *
 * Decided by the data first, as columns.ts says a header cannot be trusted:
 * - a column that is the same on every row is never the shop or the amount
 *   while another candidate exists;
 * - a money column that a running balance explains away is dropped;
 * - money with cents is preferred to whole numbers (a reference, a card
 *   number); the header (/amount|debit|credit/) only breaks a tie;
 * - the shop is the text column a header names (/desc|merchant|payee|name/),
 *   else the one with the most different values that still repeats.
 * Every money column still in the running is returned, best first, so the
 * screen can say when more than one looks like money.
 */
import { type AmountFormat } from './amount.js'
import { type ColumnProfile, explainsAsRunningBalance } from './columns.js'
import { type CsvRow, isBlankRow } from './csv.js'
import { type DateFormat } from './date.js'

export interface ProposeInput {
  readonly rows: readonly CsvRow[]
  readonly hasHeader: boolean
  readonly columns: readonly ColumnProfile[]
  readonly amountFormat: AmountFormat
}

export interface MappingProposal {
  /** Null when no column reads as dates. */
  readonly dateIndex: number | null
  readonly merchantIndex: number | null
  /** The best of amountCandidates; null when no column reads as money. */
  readonly amountIndex: number | null
  /** The date column's possible formats; more than one means the owner must choose. */
  readonly dateFormats: readonly DateFormat[]
  /** Every column that could still be the amount, best first. */
  readonly amountCandidates: readonly number[]
}

const AMOUNT_HEADER = /amount|debit|credit/i
const SHOP_HEADER = /desc|merchant|payee|name/i

export function proposeMapping(input: ProposeInput): MappingProposal {
  const { columns } = input
  const varying = <T extends ColumnProfile>(list: readonly T[]): readonly T[] => {
    const kept = list.filter((c) => !c.constant)
    return kept.length > 0 ? kept : list
  }

  const date = varying(columns.filter((c) => c.dateFormats.length > 0))[0]

  const records = input.rows.filter((r) => !isBlankRow(r))
  const data = input.hasHeader ? records.slice(1) : records
  const cells = (index: number) => data.map((r) => r.fields[index] ?? '')
  const money = varying(columns.filter((c) => c.readsAsAmount && c.index !== date?.index))
  const notBalances = money.filter(
    (c) => !money.some((o) => o.index !== c.index && explainsAsRunningBalance(cells(c.index), cells(o.index), input.amountFormat)),
  )
  const hasCents = (c: ColumnProfile) => cells(c.index).some((cell) => /[.,]\d{1,2}\)?$/.test(cell.trim()))
  const rank = (c: ColumnProfile) => (hasCents(c) ? 0 : 2) + (AMOUNT_HEADER.test(c.header ?? '') ? 0 : 1)
  const amountCandidates = [...notBalances].sort((a, b) => rank(a) - rank(b) || a.index - b.index).map((c) => c.index)

  const text = varying(columns.filter((c) => !c.readsAsAmount && c.dateFormats.length === 0))
  const named = text.find((c) => SHOP_HEADER.test(c.header ?? ''))
  const repeating = text.filter((c) => !c.unique).sort((a, b) => b.distinctValues - a.distinctValues || a.index - b.index)[0]
  const merchant = named ?? repeating ?? text[0]

  return {
    dateIndex: date?.index ?? null,
    merchantIndex: merchant?.index ?? null,
    amountIndex: amountCandidates[0] ?? null,
    dateFormats: date?.dateFormats ?? [],
    amountCandidates,
  }
}
