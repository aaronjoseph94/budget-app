/**
 * Where this month stands before any spending still to come (F30, F31,
 * docs/formula-decisions.md; plan slice A13): the Month's own sheet (F7),
 * the pay still due (F29), the bills not charged yet and the savings still
 * planned. The month's end and safe to spend both start here, so the two
 * can never disagree about what is already counted. Nothing is stored.
 */
import { type Cents, type IsoDate, subCents, sumCents } from '@budget/money-primitives'
import type { BudgetHistoryRow } from './budgets.js'
import { type ExpectedPay, type IncomeSchedule, expectedPay } from './expected-pay.js'
import { type PeriodCategory, type PeriodEntry, type PeriodSheet, monthSheet } from './period-sheet.js'
import type { PlanHistoryRow } from './plans.js'

export interface MonthForecastInput {
  /** Today: its month is forecast. */
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers. A month before it was not read, and is missing, not $0. */
  readonly readFrom: IsoDate
  readonly categories: readonly PeriodCategory[]
  /** Every budget and goal (D12) and monthly amount (D13) typed up to asOf's month. */
  readonly budgetHistory: readonly BudgetHistoryRow[]
  readonly planHistory: readonly PlanHistoryRow[]
  /** Ledger rows from readFrom to the end of asOf's month. */
  readonly entries: readonly PeriodEntry[]
  readonly paySchedules: readonly IncomeSchedule[]
  /** This month's starting balance as typed; null when none was (D17). */
  readonly startingBalanceCents: number | null
}

/** Where the month stands before any spending still to come: what the month's end and safe to spend share. */
export interface MonthPosition {
  readonly sheet: PeriodSheet
  readonly pay: ExpectedPay
  readonly billsNotChargedCents: Cents
  readonly savingsPlannedCents: Cents
  /** start + income + pay still due − Spent − saved − savings still planned; null with no start. */
  readonly availableCents: Cents | null
}

export function monthPosition(input: MonthForecastInput): MonthPosition {
  const sheet = monthSheet({ ...input, statementPeriodEnds: [] })
  const pay = expectedPay(input)
  const { blocks, summary } = sheet
  const planned = [blocks.bill, blocks.debt, blocks.subscription].flatMap((b) => b.rows.filter((r) => r.basis === 'planned').map((r) => r.actualCents))
  const stillToSave = blocks.savings.rows.flatMap((r) => (r.budgetCents !== null && r.budgetCents > r.actualCents ? [subCents(r.budgetCents, r.actualCents)] : []))
  const savingsPlannedCents = sumCents(stillToSave)
  const start = summary.startingBalanceCents
  const out = sumCents([summary.spentCents, summary.savedCents, savingsPlannedCents])
  return {
    sheet,
    pay,
    billsNotChargedCents: sumCents(planned),
    savingsPlannedCents,
    availableCents: start === null ? null : subCents(sumCents([start, summary.incomeCents, pay.dueCents]), out),
  }
}
