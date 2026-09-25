/**
 * The Forecast's figures (plan §2.5, A13): where the month ends, safe to
 * spend and the next 30 days, each packages/core's (F29 to F32), with the
 * charts' places from core's scaleSeries. This renames the rows the
 * Coach's year read gave and hands them over; nothing is added up here.
 */
import {
  cashFlow30,
  isoDate,
  monthEndForecast,
  safeToSpend,
  scaleSeries,
  type CashFlow30,
  type MonthEndForecast,
  type MonthForecastInput,
  type SafeToSpend,
  type ScaledSeries,
} from '@budget/core'
import type { Category } from '../ledger.js'
import { budgetsForCore, categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import { type DigestRows, type ForecastRows, forecastOf, historyOf } from '../coach/facts.js'

export interface ForecastFigures {
  readonly monthEnd: MonthEndForecast
  readonly safe: SafeToSpend
  readonly flow: CashFlow30
  /** Today's balance, then each of the 30 days; null with no line. */
  readonly line: ScaledSeries | null
}

/** Throws where the engine refuses a row, for the screen to say so. */
export function forecastFigures(read: DigestRows, rows: Extract<ForecastRows, { status: 'ready' }>, categories: readonly Category[]): ForecastFigures {
  const input: MonthForecastInput = {
    asOf: isoDate(read.asOf),
    historyStart: historyOf(read),
    readFrom: isoDate(read.readFrom),
    categories: categoriesForCore(categories),
    budgetHistory: budgetsForCore(read.budgets),
    planHistory: plansForCore(read.plans),
    entries: entriesForCore(read.rows),
    ...forecastOf(rows),
  }
  const monthEnd = monthEndForecast(input)
  const flow = cashFlow30(input)
  const today = flow.todayCents
  return {
    monthEnd,
    safe: safeToSpend(input),
    flow,
    line: today === null ? null : scaleSeries({ values: [today, ...flow.days.map((day) => day.balanceCents)] }),
  }
}
