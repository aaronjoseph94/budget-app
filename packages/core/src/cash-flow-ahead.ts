/**
 * The next three months (F35, docs/formula-decisions.md; plan slice A14).
 *
 * NOT workbook-derived: the workbook has no forecast. Each of the three
 * calendar months after asOf's is what usually comes in, the plans and
 * savings goals in effect then (D13, D12), and Variable spending as a low,
 * middle and high month the owner has really had, so a rent rise typed from
 * November counts from November. With a typed start the months chain from
 * the month's most likely end (F30) as a worst, middle and best case.
 * Rough under three complete months, and nothing with none. Nothing here is
 * stored.
 */
import { type Cents, type IsoDate, ZERO_CENTS, cents, subCents, sumCents } from '@budget/money-primitives'
import { resolveBudgets } from './budgets.js'
import { usualPay } from './expected-pay.js'
import { firstComplete } from './goal-forecast.js'
import { type Evidence, completeMonths, evidenceOf } from './history.js'
import { monthActuals } from './month-actuals.js'
import { type Spread, monthEndForecast, toTen } from './month-end.js'
import type { MonthForecastInput } from './month-position.js'
import { paydaysIn } from './pay-period.js'
import { billsTotals } from './plans.js'
import { median, quantile } from './stats.js'
import { byName } from './order.js'
import { monthBounds, shiftMonth } from './week.js'

export interface AheadMonth {
  /** The month, by its first day. */
  readonly month: IsoDate
  readonly payCents: Cents
  /** Every Bills, Debts and Subscriptions amount in effect that month (D13). */
  readonly billsCents: Cents
  /** Every Savings row's goal in effect that month (D12). */
  readonly savingsCents: Cents
  /** Variable spending, to $10: low the 25th percentile, mid the median, high the 75th. */
  readonly variable: Spread
  /** pay − bills − variable − savings, to $10: low the worst case (the most spent), high the best. */
  readonly net: Spread
  /** The balance at the month's end, chained from F30's most likely end; null with no start (D17). */
  readonly balance: Spread | null
}

export interface CashFlowAhead {
  readonly status: 'too_early' | 'rough' | 'range'
  /** With no complete month, the day the first one completes; null otherwise, or with no records. */
  readonly checkBackOn: IsoDate | null
  /** Complete months the spending spread uses, at most 6 (F24). */
  readonly completeMonths: number
  readonly evidence: Evidence
  /** Income sources whose pay is left out of some month, in the list's order (F29's not counted). */
  readonly payNotCounted: readonly string[]
  /** The three months ahead; none when too early. */
  readonly months: readonly AheadMonth[]
}

const MONTHS_AHEAD = 3
const SPREAD_MONTHS = 6

export function cashFlowAhead(input: MonthForecastInput): CashFlowAhead {
  const { asOf } = input
  const months = completeMonths(input).months.slice(0, SPREAD_MONTHS)
  const shared = { completeMonths: months.length, evidence: evidenceOf(months.length) }
  if (months.length === 0) return { ...shared, status: 'too_early', checkBackOn: firstComplete(input), payNotCounted: [], months: [] }

  const kinds = new Map(input.categories.map((c) => [c.id, c.kind]))
  const totals = monthActuals({ ...input, months }).months.map((m) => {
    const total = sumCents([...m.actuals].flatMap(([id, c]) => (kinds.get(id) === 'variable' ? [c] : [])))
    return total > 0 ? total : 0
  })
  const rough = months.length < 3
  const mid = median({ values: totals })!
  // The least spent is the best case: low and high are the 25th and 75th percentiles.
  const spend = rough ? { low: mid, mid, high: mid } : { low: quantile({ values: totals, pBp: 2_500 })!, mid, high: quantile({ values: totals, pBp: 7_500 })! }

  const incomes = input.categories.filter((c) => c.kind === 'income').sort((a, b) => a.sortOrder - b.sortOrder || byName(a.name, b.name))
  const usual = new Map(incomes.map((c) => [c.id, usualPay(input.entries.filter((e) => e.categoryId === c.id), input.historyStart, asOf)]))
  const notCounted = new Set<string>()

  const end = monthEndForecast(input).end
  let chain = end === null ? null : { low: end.mid as number, mid: end.mid as number, high: end.mid as number }
  const ahead = Array.from({ length: MONTHS_AHEAD }, (_, i) => i + 1).map((step): AheadMonth => {
    const { start, end: last } = monthBounds(shiftMonth(monthBounds(asOf).start, step))
    const inEffect = new Map(resolveBudgets({ asOf: start, history: input.budgetHistory }).budgets.map((b) => [b.categoryId, b.budgetCents]))
    const pay = incomes.map((c): Cents => {
      const schedule = input.paySchedules.find((s) => s.categoryId === c.id)
      const perPayday = usual.get(c.id) ?? null
      if (schedule !== undefined && perPayday !== null) return cents(perPayday * paydaysIn({ schedule, from: start, to: last }).length)
      const goal = inEffect.get(c.id) ?? null
      if (goal !== null) return goal
      // F29: a row that has never paid, with no schedule or goal, is idle, not pay left out.
      if (schedule !== undefined || perPayday !== null) notCounted.add(c.id)
      return ZERO_CENTS
    })
    const payCents = sumCents(pay)
    const billsCents = billsTotals({ month: start, categories: input.categories, planHistory: input.planHistory }).allFixedCents
    const savingsCents = sumCents([...inEffect].flatMap(([id, goal]) => (goal !== null && kinds.get(id) === 'savings' ? [goal] : [])))
    const before = subCents(payCents, sumCents([billsCents, savingsCents]))
    // Worst takes the most spent, best the least; each unrounded until drawn.
    const net = { low: before - spend.high, mid: before - spend.mid, high: before - spend.low }
    chain = chain === null ? null : { low: chain.low + net.low, mid: chain.mid + net.mid, high: chain.high + net.high }
    return {
      month: start,
      payCents,
      billsCents,
      savingsCents,
      variable: tens(spend),
      net: tens(net),
      balance: chain === null ? null : tens(chain),
    }
  })

  return {
    ...shared,
    status: rough ? 'rough' : 'range',
    checkBackOn: null,
    payNotCounted: incomes.filter((c) => notCounted.has(c.id)).map((c) => c.id),
    months: ahead,
  }
}

function tens(spread: { readonly low: number; readonly mid: number; readonly high: number }): Spread {
  return { low: toTen(spread.low), mid: toTen(spread.mid), high: toTen(spread.high) }
}
