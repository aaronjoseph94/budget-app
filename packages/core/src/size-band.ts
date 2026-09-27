/**
 * A charge's size, as Review's suggestions tell the AI about it (F46,
 * docs/formula-decisions.md; plan §3.6, A21).
 *
 * The AI is never sent an amount. A band is enough to tell a coffee from a
 * tank of fuel, and deciding it here keeps every comparison of money in
 * the engine (CLAUDE.md invariant 1).
 */
import { cents } from '@budget/money-primitives'

export interface SizeBandInput {
  /** Signed, the ledger's convention: a purchase is below $0. */
  readonly amountCents: number
}

export type Flow = 'spent' | 'received'
export type SizeBand = 'small' | 'medium' | 'large'

export interface SizeBandOutput {
  readonly flow: Flow
  /** small under $20.00, medium under $100.00, large from $100.00, by the amount without its sign. */
  readonly size: SizeBand
}

const SMALL_BELOW = 2_000
const MEDIUM_BELOW = 10_000

export function sizeBand(input: SizeBandInput): SizeBandOutput {
  const amount = cents(input.amountCents)
  const size = Math.abs(amount)
  return { flow: amount < 0 ? 'spent' : 'received', size: size < SMALL_BELOW ? 'small' : size < MEDIUM_BELOW ? 'medium' : 'large' }
}
