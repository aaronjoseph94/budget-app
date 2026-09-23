/**
 * The parts of a whole that the Month's charts draw (F17).
 *
 * A chart's geometry is a division of money — a slice is a category's
 * spending over the block's, a bar is an amount over the largest — and
 * invariant 1 keeps every such sum here. chart-specs is given basis points
 * and only turns them into angles and lengths.
 *
 * Excel semantics. Jan chart13 is a doughnut of Jan!U22:U45, each row by
 * position, labels off; Jan chart12 stacks Goal (O10:O16) and Actual
 * (P10:P16) on one value axis. Neither prints a number, and the sample's
 * doughnut is empty (U22:U44 are 0, U45 is blank), so no cached share
 * exists. What a share is, and how it rounds, is F17: of the rows above
 * zero, half-up to a basis point as F13 rounds, so a refund is never drawn
 * as spending.
 */
import { type Cents, ZERO_CENTS, cents } from '@budget/money-primitives'

/**
 * `part` of `whole` in basis points, rounded half-up. Exact for any amount:
 * the product is taken in BigInt, where a Cents total times 20,000 could
 * pass the largest integer a double holds.
 */
export function shareOf(part: Cents, whole: Cents): number {
  if (part < 0 || whole <= 0) throw new RangeError(`A share needs a part of zero or more of a whole above zero`)
  return Number((BigInt(part) * 20_000n + BigInt(whole)) / (2n * BigInt(whole)))
}

export interface GoalBarsInput {
  /** The Income block's rows, as periodSheet gives them: a Goal (null for none) and an Actual. */
  readonly rows: readonly { readonly categoryId: string; readonly budgetCents: number | null; readonly actualCents: number }[]
}

export interface GoalBar {
  readonly categoryId: string
  /** The Goal's length, in basis points of the scale. Null with no goal, or nothing to scale. */
  readonly goalBp: number | null
  /** The Actual's length, in basis points of the scale. Null when money went back out, or nothing to scale. */
  readonly actualBp: number | null
}

export interface GoalBarsOutput {
  /** The largest Goal or Actual, which is 10,000 bp; zero when none is above zero. */
  readonly scaleCents: Cents
  readonly bars: readonly GoalBar[]
}

/**
 * Workbook's income chart (Jan chart12): each row's Goal and Actual on one
 * scale, the largest of them all, so a $400 goal draws shorter than a
 * $5,700 one. An Actual beyond its Goal runs past its track.
 */
export function goalBars(input: GoalBarsInput): GoalBarsOutput {
  const rows = input.rows.map((r) => ({
    categoryId: r.categoryId,
    goal: r.budgetCents === null ? null : cents(r.budgetCents),
    actual: cents(r.actualCents),
  }))
  const scale = rows.reduce<Cents>((max, r) => {
    const larger = r.goal !== null && r.goal > r.actual ? r.goal : r.actual
    return larger > max ? larger : max
  }, ZERO_CENTS)
  return {
    scaleCents: scale,
    bars: rows.map((r) => ({
      categoryId: r.categoryId,
      goalBp: scale === 0 || r.goal === null ? null : shareOf(r.goal, scale),
      // No bar can be drawn below zero: money taken back out shows as its
      // amount beside the chart, not as a length.
      actualBp: scale === 0 || r.actual < 0 ? null : shareOf(r.actual, scale),
    })),
  }
}
