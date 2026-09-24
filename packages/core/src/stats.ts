/**
 * The middle of a list, and how far it spreads (F27, docs/formula-decisions.md).
 *
 * On whole numbers only, cents or days, and exact: an even count's middle
 * two are added in BigInt and halved half-up on the magnitude, as F26
 * rounds, so no amount can outrun a double. A quantile is taken by nearest
 * rank, never between ranks, so every one is a value that happened. None of
 * these has a workbook cell; the tests are worked by hand.
 */

export interface StatsInput {
  /** Whole numbers, in any order. */
  readonly values: readonly number[]
}

/** The middle value; with an even count, the middle two halved half-up. None for no values. */
export function median(input: StatsInput): number | null {
  const sorted = sortedWhole(input.values)
  const n = sorted.length
  if (n === 0) return null
  if (n % 2 === 1) return sorted[(n - 1) / 2]!
  const sum = BigInt(sorted[n / 2 - 1]!) + BigInt(sorted[n / 2]!)
  const size = sum < 0n ? -sum : sum
  const half = (size + 1n) / 2n
  return Number(sum < 0n ? -half : half)
}

export interface QuantileInput extends StatsInput {
  /** The share, in basis points: 2,500 is the 25th percentile, 10,000 the largest. */
  readonly pBp: number
}

/** The value at rank ⌈p × n ÷ 10000⌉, at least 1, of the list sorted ascending. None for no values. */
export function quantile(input: QuantileInput): number | null {
  const { pBp } = input
  if (!Number.isInteger(pBp) || pBp < 1 || pBp > 10_000) {
    throw new RangeError(`A quantile's share must be 1 to 10,000 basis points, received ${pBp}`)
  }
  const sorted = sortedWhole(input.values)
  if (sorted.length === 0) return null
  const rank = Math.max(1, Math.ceil((pBp * sorted.length) / 10_000))
  return sorted[rank - 1]!
}

/** The median of each value's distance from the median. None for no values. */
export function mad(input: StatsInput): number | null {
  const middle = median(input)
  if (middle === null) return null
  return median({ values: input.values.map((v) => Math.abs(v - middle)) })
}

function sortedWhole(values: readonly number[]): number[] {
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new RangeError(`Expected whole numbers, received ${v}`)
  }
  return [...values].sort((a, b) => a - b)
}
