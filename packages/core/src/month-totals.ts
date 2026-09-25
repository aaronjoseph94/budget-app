/**
 * A month's Income, Spent and Saved, and what share of the pay was saved
 * (F36, docs/formula-decisions.md; plan §7, slice A15).
 *
 * The workbook's month tabs each hold one month and never review it
 * against another, so nothing here has a cached value; the tests are worked
 * by hand. A month is counted exactly as the Month counts it, through
 * periodSheet with that month's own amounts in effect (D13), so a review
 * never disagrees with the screen it reviews.
 */
import type { Cents, IsoDate } from '@budget/money-primitives'
import { completeMonths } from './history.js'
import { type PeriodCategory, type PeriodEntry, periodSheet, plansInEffect } from './period-sheet.js'
import type { PlanHistoryRow } from './plans.js'
import { monthBounds } from './week.js'

export interface SavingsRateInput {
  readonly incomeCents: number
  readonly savedCents: number
}

/** F36: saved × 10,000 ÷ income, half-up with the sign kept; none when income is $0 or less. */
export function savingsRate(input: SavingsRateInput): { readonly rateBp: number | null } {
  // A share of nothing, or of refunds, means nothing.
  if (input.incomeCents <= 0) return { rateBp: null }
  const saved = BigInt(input.savedCents)
  const size = saved < 0n ? -saved : saved
  const income = BigInt(input.incomeCents)
  const rate = Number((size * 20_000n + income) / (2n * income))
  return { rateBp: saved < 0n ? -rate : rate }
}

/** The three figures a review is made of, over one window. */
export interface Totals {
  readonly incomeCents: Cents
  readonly spentCents: Cents
  readonly savedCents: Cents
  /** F36; null when nothing came in. */
  readonly savingsRateBp: number | null
}

/** Days `from` to `to` of one month, with that month's amounts: planned bills count on their due day (F8). */
export function windowTotals(
  input: { readonly categories: readonly PeriodCategory[]; readonly planHistory: readonly PlanHistoryRow[]; readonly entries: readonly PeriodEntry[] },
  from: IsoDate,
  to: IsoDate,
): Totals {
  const sheet = periodSheet({
    from,
    to,
    categories: input.categories,
    budgets: [],
    plans: plansInEffect(input.categories, input.planHistory, from),
    entries: input.entries,
    statementPeriodEnds: [],
    startingBalanceCents: null,
  })
  const { incomeCents, spentCents, savedCents } = sheet.summary
  return { incomeCents, spentCents, savedCents, savingsRateBp: savingsRate({ incomeCents, savedCents }).rateBp }
}

export interface MonthlyTotalsInput {
  /** Today: its month is still running, so never complete. */
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers: a month before it was not read, and is missing, not $0. */
  readonly readFrom: IsoDate
  readonly categories: readonly PeriodCategory[]
  /** Every monthly amount typed; each month resolves its own (D13). */
  readonly planHistory: readonly PlanHistoryRow[]
  readonly entries: readonly PeriodEntry[]
}

export interface MonthTotals extends Totals {
  /** The month, by its first day. */
  readonly month: IsoDate
}

/** F36: each complete month's whole-month totals (F24), newest first. */
export function monthlyTotals(input: MonthlyTotalsInput): { readonly months: readonly MonthTotals[] } {
  const { months } = completeMonths({ asOf: input.asOf, historyStart: input.historyStart, readFrom: input.readFrom })
  return { months: months.map((month) => ({ month, ...windowTotals(input, month, monthBounds(month).end) })) }
}

