/**
 * What an import came to.
 *
 * Exists so the screen can show a total without computing one. Invariant 1
 * admits no exceptions: the UI formats and displays, it never adds up money.
 * A sum written in a component is a second place for a figure to be wrong, and
 * the wrong one is the one the user sees.
 *
 * Amounts are signed (docs/divergences.md D3), so a net total is the plain sum
 * and the two directions are separated by sign rather than by which list they
 * arrived in.
 */
import { type Cents, ZERO_CENTS, cents, sumCents } from '@budget/money-primitives'

export interface ImportSummaryInput {
  readonly amountsCents: readonly number[]
}

export interface ImportSummary {
  readonly count: number
  /** Inflows minus outflows. Negative when the period spent more than it took. */
  readonly netCents: Cents
  /** Sum of the positive amounts. Zero when there were none. */
  readonly inflowCents: Cents
  /** Sum of the negative amounts, and therefore negative or zero. */
  readonly outflowCents: Cents
}

export function summariseImport(input: ImportSummaryInput): ImportSummary {
  const amounts = input.amountsCents.map((value) => cents(value))
  const inflows = amounts.filter((a) => a > 0)
  const outflows = amounts.filter((a) => a < 0)

  return {
    count: amounts.length,
    netCents: amounts.length === 0 ? ZERO_CENTS : sumCents(amounts),
    inflowCents: inflows.length === 0 ? ZERO_CENTS : sumCents(inflows),
    outflowCents: outflows.length === 0 ? ZERO_CENTS : sumCents(outflows),
  }
}

/**
 * The summary, or 'too_large' when the amounts cannot be added up as whole
 * cents. Each statement row is held to a transaction's limit, but enough
 * of them still pass the largest whole number, and the import preview adds
 * them up while it draws: summariseImport's RangeError there took the whole
 * Add screen down. Every partial sum stays within the reach of all the
 * amounts' sizes added together, so a reach within range cannot throw.
 */
export function summariseImportWithin(input: ImportSummaryInput): ImportSummary | 'too_large' {
  let reach = 0
  for (const amount of input.amountsCents) reach += Math.abs(amount)
  return reach > Number.MAX_SAFE_INTEGER ? 'too_large' : summariseImport(input)
}
