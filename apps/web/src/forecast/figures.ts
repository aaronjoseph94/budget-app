/**
 * The Forecast's figures (plan §2.5, A13): where the month ends, safe to
 * spend and the next 30 days, each packages/core's (F29 to F32), with the
 * charts' places from core's scaleSeries. This renames the rows the
 * Coach's year read gave and hands them over; nothing is added up here.
 */
import {
  cashFlow30,
  cashFlowAhead,
  isoDate,
  monthEndForecast,
  safeToSpend,
  scaleSeries,
  type CashFlow30,
  type CashFlowAhead,
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
  /** Today's balance, then the month's lowest, most likely and highest end, in that order; null with no end to draw. */
  readonly range: ScaledSeries | null
  /** Today's balance, then each of the 30 days; null with no line. */
  readonly line: ScaledSeries | null
  readonly ahead: CashFlowAhead
  /**
   * $0, then each month ahead's worst, most likely and best: its balance with
   * a start, else its net (D17). Null with no month to draw.
   */
  readonly aheadBars: ScaledSeries | null
}

/** The rows the Coach's year read gave, renamed for core's forecast. */
export function forecastInput(read: DigestRows, rows: Extract<ForecastRows, { status: 'ready' }>, categories: readonly Category[]): MonthForecastInput {
  return {
    asOf: isoDate(read.asOf),
    historyStart: historyOf(read),
    readFrom: isoDate(read.readFrom),
    categories: categoriesForCore(categories),
    budgetHistory: budgetsForCore(read.budgets),
    planHistory: plansForCore(read.plans),
    entries: entriesForCore(read.rows),
    ...forecastOf(rows),
  }
}

/** Throws where the engine refuses a row, for the screen to say so. */
export function forecastFigures(read: DigestRows, rows: Extract<ForecastRows, { status: 'ready' }>, categories: readonly Category[]): ForecastFigures {
  const input = forecastInput(read, rows, categories)
  const monthEnd = monthEndForecast(input)
  const flow = cashFlow30(input)
  const { end } = monthEnd
  const today = flow.todayCents
  const ahead = cashFlowAhead(input)
  const drawn = ahead.months.flatMap((m) => {
    const s = m.balance ?? m.net
    return [s.low, s.mid, s.high]
  })
  return {
    monthEnd,
    safe: safeToSpend(input),
    flow,
    // Both need the typed start, so an end always comes with today's balance (D17).
    range: end === null || today === null ? null : scaleSeries({ values: [today, end.low, end.mid, end.high] }),
    line: today === null ? null : scaleSeries({ values: [today, ...flow.days.map((day) => day.balanceCents)] }),
    ahead,
    // $0 is on the scale, so each bar starts there.
    aheadBars: drawn.length === 0 ? null : scaleSeries({ values: [0, ...drawn] }),
  }
}
