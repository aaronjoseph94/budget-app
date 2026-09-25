/**
 * Pay still due this month (F29, docs/formula-decisions.md; plan slice A13).
 *
 * NOT workbook-derived: the workbook has no forecast. Each Income source's
 * paydays left this month, at what it usually pays; a source that cannot
 * be counted is named, never read as $0, so a forecast that leaves pay out
 * can say so. Nothing here is stored: it is worked out on every read.
 */
import { type Cents, type IsoDate, ZERO_CENTS, addDays, cents, subCents, sumCents } from '@budget/money-primitives'
import { type BudgetHistoryRow, resolveBudgets } from './budgets.js'
import { type PayFrequency, paydaysIn, payShare } from './pay-period.js'
import type { PeriodCategory, PeriodEntry } from './period-sheet.js'
import { median } from './stats.js'
import { monthBounds } from './week.js'

/** An Income source's schedule (0011). */
export interface IncomeSchedule {
  readonly categoryId: string
  readonly firstPayDate: IsoDate
  readonly frequency: PayFrequency
}

export interface ExpectedPayInput {
  /** Today: its month is the one spoken about, and paydays after it are still due. */
  readonly asOf: IsoDate
  /** From historyStart; a receipt before it is outside the records. */
  readonly historyStart: IsoDate | null
  readonly categories: readonly PeriodCategory[]
  /** Ledger rows, any dates; the receipts and this month's income are found among them. */
  readonly entries: readonly PeriodEntry[]
  readonly paySchedules: readonly IncomeSchedule[]
  /** Every budget and goal typed up to asOf's month (D12). */
  readonly budgetHistory: readonly BudgetHistoryRow[]
}

/**
 * How a source's pay was counted: its usual pay a payday, its goal shared
 * across a pay period, its goal less what came in, or not at all; `idle`
 * for a row that has never paid inside the records and has no schedule or
 * goal, such as a starter list's spare, which is no pay left out.
 */
export type PayBasis = 'usual' | 'goal_share' | 'goal_left' | 'not_counted' | 'idle'

export interface PaySource {
  readonly categoryId: string
  readonly basis: PayBasis
  /** Its paydays after asOf this month; none without a schedule. */
  readonly paydays: readonly IsoDate[]
  /** What one payday brings; null without a schedule, or when not counted. */
  readonly perPaydayCents: Cents | null
  /** What it brings for the rest of the month; null when not counted. */
  readonly dueCents: Cents | null
}

export interface ExpectedPay {
  /** Every counted source's pay, added up. */
  readonly dueCents: Cents
  /** The sources not counted, in the list's order, so the forecast can name them. */
  readonly notCounted: readonly string[]
  /** One per Income category, in the list's order. */
  readonly sources: readonly PaySource[]
}

const RECEIPTS = 3

export function expectedPay(input: ExpectedPayInput): ExpectedPay {
  const { asOf } = input
  const { start, end } = monthBounds(asOf)
  const goals = new Map(resolveBudgets({ asOf, history: input.budgetHistory }).budgets.map((b) => [b.categoryId, b.budgetCents]))
  const incomes = input.categories
    .filter((c) => c.kind === 'income')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  const sources = incomes.map((c): PaySource => {
    const rows = input.entries.filter((e) => e.categoryId === c.id)
    const goal = goals.get(c.id) ?? null
    // N27: a schedule counts only on a category that is on Income, as this one is.
    const schedule = input.paySchedules.find((s) => s.categoryId === c.id)
    if (schedule === undefined) {
      if (goal === null) return usualPay(rows, input.historyStart, asOf) === null ? { ...notCounted(c.id), basis: 'idle' } : notCounted(c.id)
      const got = sumCents(rows.filter((e) => e.postedOn >= start && e.postedOn <= end).map((e) => cents(e.amountCents)))
      const left = subCents(goal, got)
      return { categoryId: c.id, basis: 'goal_left', paydays: [], perPaydayCents: null, dueCents: left > 0 ? left : ZERO_CENTS }
    }
    const paydays = asOf >= end ? [] : paydaysIn({ schedule, from: addDays(asOf, 1), to: end })
    const usual = usualPay(rows, input.historyStart, asOf)
    const perPayday = usual ?? (goal === null ? null : payShare({ monthlyCents: goal, frequency: schedule.frequency }))
    if (perPayday === null) return notCounted(c.id)
    return {
      categoryId: c.id,
      basis: usual === null ? 'goal_share' : 'usual',
      paydays,
      perPaydayCents: perPayday,
      dueCents: cents(perPayday * paydays.length),
    }
  })

  return {
    dueCents: sumCents(sources.flatMap((s) => (s.dueCents === null ? [] : [s.dueCents]))),
    notCounted: sources.filter((s) => s.basis === 'not_counted').map((s) => s.categoryId),
    sources,
  }
}

function notCounted(categoryId: string): PaySource {
  return { categoryId, basis: 'not_counted', paydays: [], perPaydayCents: null, dueCents: null }
}

/**
 * The median of the last three receipts: rows above $0 inside the records
 * and on or before asOf, the latest first and, on one day, the larger
 * first. None with no receipt.
 */
export function usualPay(rows: readonly PeriodEntry[], historyStart: IsoDate | null, asOf: IsoDate): Cents | null {
  if (historyStart === null) return null
  const receipts = rows
    .filter((e) => e.amountCents > 0 && e.postedOn >= historyStart && e.postedOn <= asOf)
    .sort((a, b) => (a.postedOn < b.postedOn ? 1 : a.postedOn > b.postedOn ? -1 : b.amountCents - a.amountCents))
    .slice(0, RECEIPTS)
  const middle = median({ values: receipts.map((e) => cents(e.amountCents)) })
  return middle === null ? null : cents(middle)
}
