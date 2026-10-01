/**
 * A search's totals (F52, docs/formula-decisions.md; MCP plan §2.4, tool 7):
 * money out and money in over every row a search matched, with the rows on
 * Not spending left out and counted.
 *
 * NOT workbook-derived: the workbook has no search. Gross, not net: a
 * refund is money in, never taken off what went out, so the totals agree
 * with the rows a search for money out or money in lists. Nothing here is
 * stored.
 */
import { type Cents, ZERO_CENTS, cents, subCents, sumCents } from '@budget/money-primitives'
import type { CategoryKind } from './week.js'

export interface EntriesTotalsInput {
  /** Every row matched, each signed as the ledger is (D3: money out is below $0), with its category's list. */
  readonly entries: readonly { readonly amountCents: number; readonly kind: CategoryKind }[]
}

export interface EntriesTotals {
  /** The magnitudes of the rows below $0, Not spending left out. */
  readonly spentCents: Cents
  /** The rows above $0, Not spending left out. */
  readonly receivedCents: Cents
  /** Every row, Not spending included. */
  readonly count: number
  /** The rows on Not spending, in neither total. */
  readonly notSpendingCount: number
}

export function entriesTotals(input: EntriesTotalsInput): EntriesTotals {
  const counted = input.entries.filter((e) => e.kind !== 'transfer').map((e) => cents(e.amountCents))
  return {
    // Subtracted from zero, so no money out is 0 and not -0.
    spentCents: subCents(ZERO_CENTS, sumCents(counted.filter((c) => c < 0))),
    receivedCents: sumCents(counted.filter((c) => c > 0)),
    count: input.entries.length,
    notSpendingCount: input.entries.length - counted.length,
  }
}
