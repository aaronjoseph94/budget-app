/**
 * How much money a fact is about, for ranking the Coach's cards, and the
 * day's rotation for picking among equals (F44, docs/formula-decisions.md).
 *
 * Every fact is put in one unit, a month's money, so a change seen over 24
 * days and a budget passed by $30 can be set side by side; then weighed by
 * how much history stands behind it, so a big swing on one month of records
 * does not outrank a steady one on six. No workbook cell; worked by hand.
 */
import { type Cents, type IsoDate, cents, daysBetween, isoDate } from '@budget/money-primitives'
import type { Evidence } from './history.js'

export type ImpactScoreInput =
  /** A change over d days of a month of D, scaled to the whole month. */
  | {
      readonly effect: 'change'
      readonly changeCents: Cents
      readonly days: number
      readonly daysInMonth: number
      readonly evidence: Evidence
    }
  /** A figure that is already a month's: over or left on a budget, a pace over it. */
  | { readonly effect: 'monthly'; readonly monthlyCents: Cents; readonly evidence: Evidence }

export interface ImpactScore {
  /** The monthly effect, by its size. */
  readonly effectCents: Cents
  /** The effect × the evidence's weight: thin 1, some 2, solid 3. */
  readonly impact: number
}

const WEIGHT: Readonly<Record<Evidence, number>> = { thin: 1, some: 2, solid: 3 }

export function impactScore(input: ImpactScoreInput): ImpactScore {
  let effect: number
  if (input.effect === 'monthly') {
    effect = Math.abs(input.monthlyCents)
  } else {
    const { days, daysInMonth } = input
    if (!Number.isInteger(days) || days < 1 || days > daysInMonth) {
      throw new RangeError(`A window of ${days} days is not inside a month of ${daysInMonth}`)
    }
    const part = BigInt(Math.abs(input.changeCents)) * BigInt(daysInMonth)
    effect = Number((part * 2n + BigInt(days)) / (2n * BigInt(days)))
  }
  return { effectCents: cents(effect), impact: effect * WEIGHT[input.evidence] }
}

const EPOCH = isoDate('1970-01-01')

/** The days from 1 January 1970 to asOf, modulo the count: the same pick all day, the next one tomorrow. */
export function dailyIndex(input: { readonly asOf: IsoDate; readonly count: number }): { readonly index: number } {
  const { count } = input
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`A rotation needs 1 or more to pick from, received ${count}`)
  const days = daysBetween(EPOCH, input.asOf)
  return { index: ((days % count) + count) % count }
}
