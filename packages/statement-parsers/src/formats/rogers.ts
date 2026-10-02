/**
 * A Rogers Bank Mastercard statement, read from its PDF.
 *
 * Format-specific on purpose. A generic "read any statement" parser has to
 * guess which column is which, and a guess that goes wrong on page four moves
 * an amount into a merchant name without saying so. This knows one bank's
 * layout, and everything it knows is a measurement:
 *
 *   trans date  x 20…55     post date  x 55…90
 *   description x 90…300    amount     x 300… , right-aligned near 368
 *
 * The boundary at 300 sits in the middle of a measured 67-unit gap: across a
 * whole statement the description never reached past x=265.7 and the leftmost
 * amount — the widest, `-1,000.00` — began at x=333.1.
 *
 * Two facts about this format drive most of what follows.
 *
 * Dates carry no year. A row reads `Aug 6`, and the year appears only in the
 * period header. A December statement therefore contains both December and
 * January dates belonging to different years.
 *
 * Signs are inverted relative to the ledger. The statement writes a purchase
 * as positive and a payment as negative; docs/divergences.md D3 has outflows
 * negative. Every amount is flipped on the way through.
 */

import { type Cents, cents, isoDate } from '@budget/money-primitives'
import { IngestedTextSchema, type RejectionReason } from '@budget/schema'
import { US_AMOUNT_FORMAT, applySignConvention, parseAmountToCents } from '../amount.js'
import { groupRows } from '../pdf/layout.js'
import type { TextRun } from '../pdf/text.js'
import type { AcceptedRow, RejectedRow } from '../read.js'
import { civilDate, resolveYear, type StatementPeriod } from './yearless-dates.js'

/** Measured from a real statement. See the note above. */
export const ROGERS_COLUMNS: readonly number[] = [20, 55, 90, 300]

/**
 * The statement's own totals, as it prints them.
 *
 * Both `paymentsAndCredits` and `purchasesAndDebits` are POSITIVE here,
 * because that is how a statement presents them. Structurally identical to
 * core's `StatementSummary` so it can be handed straight to
 * `reconcileStatement`; declared separately because parsers may not import the
 * engine (CAPABILITY-MAP.md), and an arrow either way would be a cycle.
 */
export interface RogersSummary {
  readonly previousBalanceCents: Cents
  readonly paymentsAndCreditsCents: Cents
  readonly purchasesAndDebitsCents: Cents
  readonly cashAdvancesCents: Cents
  readonly feesCents: Cents
  readonly interestCents: Cents
  readonly newBalanceCents: Cents
}

export interface RogersRead {
  readonly period: StatementPeriod
  readonly summary: RogersSummary
  readonly parsed: number
  readonly accepted: readonly AcceptedRow[]
  readonly rejected: readonly RejectedRow[]
  /** Amounts in STATEMENT sign, for reconciliation against the printed totals. */
  readonly statementAmountsCents: readonly number[]
}

export type RogersFailure = 'no_statement_period' | 'no_summary'

export type RogersOutcome =
  | { readonly ok: true; readonly read: RogersRead }
  | { readonly ok: false; readonly failure: RogersFailure }

const MONTHS: Readonly<Record<string, number>> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
}
const MONTH_NAMES = Object.keys(MONTHS).join('|')

const PERIOD = new RegExp(
  String.raw`(${MONTH_NAMES})\s*(\d{1,2})\s*,?\s*(\d{4})\s*[-–—]\s*` +
    String.raw`(${MONTH_NAMES})\s*(\d{1,2})\s*,?\s*(\d{4})`,
  'u',
)
const DAY_CELL = new RegExp(String.raw`^(${MONTH_NAMES})\s*(\d{1,2})$`, 'u')
const MONEY = String.raw`\$?(-?[\d,]+\.\d{2})`

/** The statement period, which is where the year comes from. */
export function readPeriod(pages: readonly (readonly TextRun[])[]): StatementPeriod | null {
  for (const page of pages.slice(0, 2)) {
    for (const row of groupRows(page, [0])) {
      const m = PERIOD.exec(row.columns[0] ?? '')
      if (m === null) continue
      const fromM = MONTHS[m[1] ?? '']
      const toM = MONTHS[m[4] ?? '']
      if (fromM === undefined || toM === undefined) continue
      // Both ends through money-primitives' isoDate, which refuses a day the
      // month lacks ("Feb 30"), and in order: a period that is no date, or
      // runs backwards, is no period (architecture-a-06).
      try {
        const from = isoDate(civilDate(Number(m[3]), fromM, Number(m[2])))
        const to = isoDate(civilDate(Number(m[6]), toM, Number(m[5])))
        if (from > to) continue
        return { from, to }
      } catch (e) {
        if (!(e instanceof RangeError)) throw e
        continue
      }
    }
  }
  return null
}

const SUMMARY_LABELS = [
  ['previousBalanceCents', String.raw`Previous\s+balance`],
  ['paymentsAndCreditsCents', String.raw`Payments\s*&\s*credits`],
  ['purchasesAndDebitsCents', String.raw`New\s+purchases\s*&\s*debits`],
  ['cashAdvancesCents', String.raw`Cash\s+advances`],
  ['feesCents', String.raw`Fees`],
  ['interestCents', String.raw`Interest`],
  ['newBalanceCents', String.raw`New\s+Balance`],
] as const

/**
 * The printed summary figures.
 *
 * Each label is matched with the amount that follows it ON THE SAME ROW. The
 * left half of the page carries a different set of figures at the same
 * heights — minimum payment beside previous balance, credit limit beside new
 * purchases — so an amount taken from anywhere but after its own label is the
 * wrong one, and wrong in a way that still reconciles against itself.
 */
export function readSummary(pages: readonly (readonly TextRun[])[]): RogersSummary | null {
  const found = new Map<string, Cents>()

  for (const page of pages.slice(0, 2)) {
    for (const row of groupRows(page, [0])) {
      const line = row.columns[0] ?? ''
      for (const [key, label] of SUMMARY_LABELS) {
        if (found.has(key)) continue
        const m = new RegExp(`${label}\\s+${MONEY}`, 'u').exec(line)
        if (m === null) continue
        const parsed = parseAmountToCents(m[1] ?? '', US_AMOUNT_FORMAT)
        if (parsed.ok) found.set(key, parsed.value)
      }
    }
  }

  if (found.size !== SUMMARY_LABELS.length) return null
  return {
    previousBalanceCents: found.get('previousBalanceCents') ?? cents(0),
    paymentsAndCreditsCents: found.get('paymentsAndCreditsCents') ?? cents(0),
    purchasesAndDebitsCents: found.get('purchasesAndDebitsCents') ?? cents(0),
    cashAdvancesCents: found.get('cashAdvancesCents') ?? cents(0),
    feesCents: found.get('feesCents') ?? cents(0),
    interestCents: found.get('interestCents') ?? cents(0),
    newBalanceCents: found.get('newBalanceCents') ?? cents(0),
  }
}

/**
 * Read a whole statement.
 *
 * `line` on each row is a running count of transaction-shaped rows across the
 * document, not a line in a file — there are no lines in a PDF. It is what the
 * review queue shows when a row could not be read, so it has to identify the
 * row a person would point at, and rows are numbered in reading order.
 */
export function readRogersStatement(pages: readonly (readonly TextRun[])[]): RogersOutcome {
  const period = readPeriod(pages)
  if (period === null) return { ok: false, failure: 'no_statement_period' }
  const summary = readSummary(pages)
  if (summary === null) return { ok: false, failure: 'no_summary' }

  const accepted: AcceptedRow[] = []
  const rejected: RejectedRow[] = []
  const statementAmountsCents: number[] = []
  let line = 0

  for (const page of pages) {
    for (const row of groupRows(page, ROGERS_COLUMNS)) {
      const [transCell, postCell, descCell, amountCell] = row.columns
      const trans = DAY_CELL.exec((transCell ?? '').trim())
      // A row is a transaction when BOTH date columns hold a date. The
      // headings, the payment stub and the terms pages all fail that, and no
      // list of things to skip has to be maintained.
      if (trans === null || DAY_CELL.exec((postCell ?? '').trim()) === null) continue

      line += 1
      const reason = readRow(trans, descCell ?? '', amountCell ?? '', period, {
        accepted,
        statementAmountsCents,
        line,
      })
      if (reason !== null) rejected.push({ line, reason })
    }
  }

  return {
    ok: true,
    read: { period, summary, parsed: line, accepted, rejected, statementAmountsCents },
  }
}

function readRow(
  trans: RegExpExecArray,
  description: string,
  amountText: string,
  period: StatementPeriod,
  sink: { accepted: AcceptedRow[]; statementAmountsCents: number[]; line: number },
): RejectionReason | null {
  const month = MONTHS[trans[1] ?? '']
  const day = Number(trans[2])
  if (month === undefined) return 'unparseable_date'

  // The user chose the date they made the purchase over the date the bank
  // settled it — see docs/formula-decisions.md F1.
  const year = resolveYear(month, day, period)
  if (year === null) return 'unparseable_date'

  if (amountText.trim().length === 0) return 'missing_amount'
  const amount = parseAmountToCents(amountText, US_AMOUNT_FORMAT)
  if (!amount.ok) return 'unparseable_amount'

  const merchant = description.trim()
  if (merchant.length === 0) return 'missing_merchant'
  if (!IngestedTextSchema.safeParse(merchant).success) return 'invalid_merchant'

  sink.statementAmountsCents.push(amount.value)
  sink.accepted.push({
    line: sink.line,
    postedOn: civilDate(year, month, day),
    // The statement writes a purchase as a positive. The ledger writes an
    // outflow as a negative.
    amountCents: applySignConvention(amount.value, { kind: 'debit_positive' }),
    merchantRaw: merchant,
    issuerTransactionId: undefined,
  })
  return null
}
