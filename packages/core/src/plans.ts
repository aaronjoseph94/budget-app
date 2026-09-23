/**
 * Which monthly amount is in effect in a month, from every one typed.
 *
 * Workbook gives each bill, debt and subscription one Day Paid and one Monthly
 * Amount (Bills!B/D, F/H, J/L 7:29), and every month tab reads that one
 * amount, past months included (Jan!E22 and Dec!E22 are both Bills!D7). An
 * app holding years of history cannot: raising the rent in October would
 * rewrite last January. So migration 0009 stores an amount from a month
 * onward (D13), and this finds the one in effect:
 *
 * - the latest row at or before the month applies, whatever order the rows
 *   come in;
 * - a row with no amount is "stopped": nothing from that month until a later
 *   row sets one again. It is returned as stopped, not left out, so a screen
 *   can tell "stopped" from "never set";
 * - a category with no row at or before the month has nothing in effect and
 *   is absent.
 *
 * The day paid travels with its row: changing only the day is a new row from
 * that month, as changing only the amount is. A blank day stays blank (F8).
 *
 * Nothing is copied into later months, and nothing here is stored: the screen
 * asks again on every read (CLAUDE.md, never persist a derived money value).
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import { monthBounds } from './week.js'

export interface PlanHistoryRow {
  readonly categoryId: string
  /** The first month it applies to, named by its first day; 0009 refuses any other day. */
  readonly effectiveMonth: IsoDate
  /** Null is "stopped from this month", not $0. */
  readonly plannedCents: number | null
  /** Workbook's Day Paid, 1–31; null when none was typed. */
  readonly dueDay: number | null
}

export interface ResolvePlansInput {
  /** Any day of the month to resolve. */
  readonly asOf: IsoDate
  /** Every row typed, for any month, in any order. */
  readonly history: readonly PlanHistoryRow[]
}

export interface ResolvedPlan {
  readonly categoryId: string
  /** Null when the row in effect stopped the amount. */
  readonly plannedCents: Cents | null
  readonly dueDay: number | null
}

export interface ResolvePlansOutput {
  /** One per category with a row in effect, in the order the history first names them. */
  readonly plans: readonly ResolvedPlan[]
}

export function resolvePlans(input: ResolvePlansInput): ResolvePlansOutput {
  const month = monthBounds(input.asOf).start
  const latest = new Map<string, PlanHistoryRow>()
  const named = new Set<string>()
  const seen = new Set<string>()

  // Every row is checked, not only those that could apply, so a history the
  // database would refuse is refused here whichever month is asked for.
  for (const row of input.history) {
    if (row.effectiveMonth !== monthBounds(row.effectiveMonth).start) {
      throw new RangeError(`A monthly amount starts in a month, named by its first day; received ${row.effectiveMonth}`)
    }
    if (row.plannedCents !== null && cents(row.plannedCents) < 0) {
      throw new RangeError(`A monthly amount cannot be negative, received ${row.plannedCents}`)
    }
    if (row.dueDay !== null && !(Number.isInteger(row.dueDay) && row.dueDay >= 1 && row.dueDay <= 31)) {
      throw new RangeError(`A day paid must be 1 to 31, received ${row.dueDay}`)
    }
    const key = `${row.categoryId}|${row.effectiveMonth}`
    if (seen.has(key)) {
      throw new RangeError(`Two monthly amounts for category ${row.categoryId} from ${row.effectiveMonth}; 0009 keeps one`)
    }
    seen.add(key)
    named.add(row.categoryId)

    if (row.effectiveMonth > month) continue
    const inEffect = latest.get(row.categoryId)
    if (inEffect === undefined || row.effectiveMonth > inEffect.effectiveMonth) latest.set(row.categoryId, row)
  }

  const plans: ResolvedPlan[] = []
  for (const categoryId of named) {
    const row = latest.get(categoryId)
    if (row === undefined) continue
    plans.push({ categoryId, plannedCents: row.plannedCents === null ? null : cents(row.plannedCents), dueDay: row.dueDay })
  }
  return { plans }
}
