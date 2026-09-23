/**
 * Which monthly amount is in effect in a month, from every one typed, and
 * Workbook's Bills totals from them.
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
import { type Cents, type IsoDate, cents, sumCents } from '@budget/money-primitives'
import { type CategoryKind, monthBounds } from './week.js'

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

/**
 * Workbook's Bills tab totals, in a month (D13): the tiles under its three cards
 * and the "Fixed Monthly Bills" tile under them.
 *
 * Excel semantics (docs/divergences.md):
 *
 * - `Bills!D32 =SUM(D7:D29)`, `H32 =SUM(H7:H29)`, `L32 =SUM(L7:L29)`: every
 *   Monthly Amount on the card, a blank adding nothing. Here, every amount in
 *   effect that month on a category on that list now; a stopped one adds
 *   nothing, and so does a month before any was set, which is a real $0.
 * - D7, `Bills!H36 =SUM(D32,H32,G46)`: G46 is an empty cell, so Workbook's
 *   "Fixed Monthly Bills" drops the subscriptions (850 where the three tiles
 *   make 867.99). The app adds all three.
 * - D8: Workbook shows the tiles in whole dollars (`"$"#,##0`, so 17.99 reads
 *   $18). The totals here keep their cents; the screen shows them.
 *
 * A category counts on the list it is on now. 0009 lets a category move off
 * Bills, Debts and Subscriptions once its amount has stopped, and keeps the
 * rows; an amount still in effect in an earlier month then counts nowhere,
 * as 0009 says it should. A row naming a category not passed in is refused
 * rather than dropped: removing a category removes its rows (0009), so this
 * is a screen whose categories and amounts were read at different moments,
 * and a total missing one looks right and is not.
 */
export interface BillsCategory {
  readonly id: string
  readonly kind: CategoryKind
}

export interface BillsTotalsInput {
  /** Any day of the month to total. */
  readonly month: IsoDate
  readonly categories: readonly BillsCategory[]
  /** Every monthly amount typed, for any month (0009). */
  readonly planHistory: readonly PlanHistoryRow[]
}

export interface BillsTotals {
  readonly billsCents: Cents
  readonly debtsCents: Cents
  readonly subscriptionsCents: Cents
  /** Bills + Debts + Subscriptions (D7). */
  readonly allFixedCents: Cents
}

export function billsTotals(input: BillsTotalsInput): BillsTotals {
  const kinds = new Map(input.categories.map((c) => [c.id, c.kind]))
  for (const row of input.planHistory) {
    if (!kinds.has(row.categoryId)) {
      throw new RangeError(`A monthly amount names category ${row.categoryId}, which was not passed in`)
    }
  }
  const lists: Record<'bill' | 'debt' | 'subscription', Cents[]> = { bill: [], debt: [], subscription: [] }
  for (const plan of resolvePlans({ asOf: input.month, history: input.planHistory }).plans) {
    const kind = kinds.get(plan.categoryId)
    if (plan.plannedCents === null) continue
    if (kind === 'bill' || kind === 'debt' || kind === 'subscription') lists[kind].push(plan.plannedCents)
  }
  const billsCents = sumCents(lists.bill)
  const debtsCents = sumCents(lists.debt)
  const subscriptionsCents = sumCents(lists.subscription)
  return { billsCents, debtsCents, subscriptionsCents, allFixedCents: sumCents([billsCents, debtsCents, subscriptionsCents]) }
}
