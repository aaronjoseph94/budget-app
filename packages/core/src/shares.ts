/**
 * The parts of a whole that the Month's and the Year's charts draw (F17, F19).
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
 *
 * A list's % pill (F50) is not a chart and no cell prints it, but it is the
 * same division: an Actual over its budget, half-up, here uncapped.
 */
import { type Cents, ZERO_CENTS, addCents, cents, sumCents } from '@budget/money-primitives'

/**
 * `part` of `whole` in basis points, rounded half-up. Exact for any amount:
 * the product is taken in BigInt, where a Cents total times 20,000 could
 * pass the largest integer a double holds.
 */
export function shareOf(part: Cents, whole: Cents): number {
  if (part < 0 || whole <= 0) throw new RangeError(`A share needs a part of zero or more of a whole above zero`)
  return Number((BigInt(part) * 20_000n + BigInt(whole)) / (2n * BigInt(whole)))
}

export interface BudgetUsedInput {
  /** A list's Actual total, as periodSheet gives it: below zero after refunds. */
  readonly actualCents: number
  /** Its budget total; null or 0 when none is set. */
  readonly budgetCents: number | null
}

export interface BudgetUsedOutput {
  /** The Actual over the budget in basis points, half-up, past 10,000 uncapped. Null: no pill. */
  readonly usedBp: number | null
}

/**
 * A list's % pill (F50): how much of its budget its Actual is, 11,600 for
 * 116%. Null with no budget or a $0 one, so nothing is divided by zero, and
 * when refunds took the Actual below zero, which no share describes.
 */
export function budgetUsedBp(input: BudgetUsedInput): BudgetUsedOutput {
  const actual = cents(input.actualCents)
  const budget = input.budgetCents === null ? null : cents(input.budgetCents)
  if (budget !== null && budget < 0) throw new RangeError(`A budget cannot be negative, received ${budget}`)
  if (budget === null || budget === 0 || actual < 0) return { usedBp: null }
  return { usedBp: shareOf(actual, budget) }
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
 * The workbook's income chart (Jan chart12): each row's Goal and Actual on one
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

export interface PartSharesInput {
  readonly parts: readonly { readonly key: string; readonly cents: number }[]
}

export interface PartSharesOutput {
  /** The parts above zero, added: what 10,000 bp is. */
  readonly wholeCents: Cents
  /** Each part's share, in the order given; null at or below zero, or with nothing above it. */
  readonly parts: readonly { readonly key: string; readonly shareBp: number | null }[]
}

/**
 * The Year's pie (F19; Annual chart41, Home chart3): each part's share of
 * the parts above zero, half-up, as F17 shares a block's rows. A part at or
 * below zero has no slice and is not in the whole.
 */
export function partShares(input: PartSharesInput): PartSharesOutput {
  const amounts = input.parts.map((p) => ({ key: p.key, amount: cents(p.cents) }))
  const whole = sumCents(amounts.filter((p) => p.amount > 0).map((p) => p.amount))
  return {
    wholeCents: whole,
    parts: amounts.map((p) => ({ key: p.key, shareBp: p.amount > 0 ? shareOf(p.amount, whole) : null })),
  }
}

export interface StackedColumnsInput {
  /** Each column's parts, bottom first. */
  readonly columns: readonly { readonly key: string; readonly parts: readonly number[] }[]
}

/** Where a drawn part starts and ends, in basis points of the scale from the baseline. */
export interface StackedPart {
  readonly fromBp: number
  readonly toBp: number
}

export interface StackedColumnsOutput {
  /** The tallest column, its parts above zero added: 10,000 bp. Zero when nothing is. */
  readonly scaleCents: Cents
  /** Each column's parts in the order given; null for a part not drawn. */
  readonly columns: readonly { readonly key: string; readonly parts: readonly (StackedPart | null)[] }[]
}

/**
 * The Year's stacked column (F19; Annual chart40): each column's parts
 * above zero stacked bottom first on one scale, the tallest column. Each
 * part's ends are the running totals' shares, so one part ends exactly
 * where the next starts and no column passes 10,000 bp; rounding each
 * part's own share would leave a gap or an overlap between them.
 */
export function stackedColumns(input: StackedColumnsInput): StackedColumnsOutput {
  const columns = input.columns.map((c) => ({ key: c.key, parts: c.parts.map((p) => cents(p)) }))
  const heights = columns.map((c) => sumCents(c.parts.filter((p) => p > 0)))
  const scale = heights.reduce<Cents>((max, h) => (h > max ? h : max), ZERO_CENTS)
  return {
    scaleCents: scale,
    columns: columns.map((c) => {
      let below = ZERO_CENTS
      return {
        key: c.key,
        parts: c.parts.map((p): StackedPart | null => {
          if (p <= 0) return null
          const top = addCents(below, p)
          const part = { fromBp: shareOf(below, scale), toBp: shareOf(top, scale) }
          below = top
          return part
        }),
      }
    }),
  }
}
