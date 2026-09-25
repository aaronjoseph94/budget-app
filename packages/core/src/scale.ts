/**
 * Where each value of a series sits between its lowest and its highest, in
 * basis points (plan §7, F32). A chart's heights are a division of money,
 * and invariant 1 keeps every such division here; chart-specs only turns
 * basis points into lengths. No workbook cell; worked by hand.
 */
import { type Cents, cents } from '@budget/money-primitives'

export interface ScaleSeriesInput {
  /** Cents, in the order drawn. */
  readonly values: readonly number[]
}

export interface ScaledSeries {
  /** Each value's place, 0 at the lowest and 10,000 at the highest; 5,000 each when all are equal. */
  readonly bps: readonly number[]
  /** Where $0 sits when it lies between the lowest and the highest, both included; null otherwise. */
  readonly zeroBp: number | null
  readonly lowCents: Cents | null
  readonly highCents: Cents | null
}

export function scaleSeries(input: ScaleSeriesInput): ScaledSeries {
  const values = input.values.map((v) => cents(v))
  if (values.length === 0) return { bps: [], zeroBp: null, lowCents: null, highCents: null }
  const low = values.reduce((a, b) => (b < a ? b : a))
  const high = values.reduce((a, b) => (b > a ? b : a))
  const span = BigInt(high - low)
  // Taken in BigInt and halved half-up: every part is 0 or more.
  const place = (v: number) => (span === 0n ? 5_000 : Number((BigInt(v - low) * 20_000n + span) / (2n * span)))
  return { bps: values.map(place), zeroBp: low <= 0 && high >= 0 ? place(0) : null, lowCents: low, highCents: high }
}
