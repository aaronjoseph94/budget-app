/**
 * The month's biggest changes: which categories moved furthest from their
 * usual month, up and down (F36, docs/formula-decisions.md; plan §7).
 *
 * A change is judged against how much the category usually moves (F27), so
 * a swing that is ordinary for it is never called out. No workbook cell;
 * the tests are worked by hand.
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import type { Evidence } from './history.js'
import { changeSize, notableBand, usualMonth } from './notable.js'

export interface MoverCategory {
  readonly categoryId: string
  /** Its place on its list, for ties. */
  readonly sortOrder: number
  /** What it came to over the days reviewed. */
  readonly nowCents: number
  /** Its total in each complete month before the reviewed one (F24), in any order. */
  readonly history: readonly { readonly month: IsoDate; readonly cents: number }[]
}

export interface BiggestMoversInput {
  readonly categories: readonly MoverCategory[]
  /** Days reviewed, 1..daysInMonth: fewer for a month so far. */
  readonly days: number
  readonly daysInMonth: number
}

export interface Mover {
  readonly categoryId: string
  readonly nowCents: Cents
  /** Its usual month, scaled to the days reviewed. */
  readonly usualCents: Cents
  /** Now − usual. */
  readonly changeCents: Cents
  readonly bandCents: Cents
  readonly size: 'clear' | 'big'
  /** Complete months the usual month was taken over. */
  readonly months: number
  readonly evidence: Evidence
}

const MOST = 3

/** F36: the three largest rises and falls against the usual month, each at least its band (F27). */
export function biggestMovers(input: BiggestMoversInput): { readonly up: readonly Mover[]; readonly down: readonly Mover[] } {
  const { days, daysInMonth } = input
  const movers = input.categories.flatMap((c): { mover: Mover; order: number }[] => {
    const usual = usualMonth({ totals: c.history.map((h) => ({ month: h.month, cents: cents(h.cents) })) })
    if (usual.usualCents === null || usual.madCents === null) return []
    const { bandCents } = notableBand({ basis: 'usual', usualCents: usual.usualCents, madCents: usual.madCents, months: usual.months, days, daysInMonth })
    const usualCents = scaled(usual.usualCents, days, daysInMonth)
    const changeCents = cents(c.nowCents - usualCents)
    const { size } = changeSize({ changeCents, bandCents })
    if (size === 'slight') return []
    const mover: Mover = { categoryId: c.categoryId, nowCents: cents(c.nowCents), usualCents, changeCents, bandCents, size, months: usual.months, evidence: usual.evidence }
    return [{ mover, order: c.sortOrder }]
  })
  const largest = (a: { mover: Mover; order: number }, b: { mover: Mover; order: number }) =>
    Math.abs(b.mover.changeCents) - Math.abs(a.mover.changeCents) ||
    a.order - b.order ||
    (a.mover.categoryId < b.mover.categoryId ? -1 : a.mover.categoryId > b.mover.categoryId ? 1 : 0)
  const pick = (rising: boolean) =>
    movers
      .filter((m) => m.mover.changeCents > 0 === rising)
      .sort(largest)
      .slice(0, MOST)
      .map((m) => m.mover)
  return { up: pick(true), down: pick(false) }
}

/** amount × days ÷ daysInMonth, half-up on the magnitude with the sign kept (F26's rounding). */
function scaled(amount: Cents, days: number, daysInMonth: number): Cents {
  if (!Number.isInteger(days) || days < 1 || days > daysInMonth) {
    throw new RangeError(`A window of ${days} days is not inside a month of ${daysInMonth}`)
  }
  const value = BigInt(amount) * BigInt(days)
  const size = value < 0n ? -value : value
  const whole = BigInt(daysInMonth)
  const half = (size * 2n + whole) / (2n * whole)
  return cents(Number(value < 0n ? -half : half))
}
