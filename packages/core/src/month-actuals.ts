/**
 * What each category came to in each of some whole months (F33, F34).
 *
 * Its Actual as the Month shows it, one periodSheet per month with no
 * budgets and no planned bills: what was spent in a category, or moved into
 * a fund, less what came back. A goal's pace and a category's usual month
 * both stand on these, so they count a month exactly as the Month does.
 */
import type { Cents, IsoDate } from '@budget/money-primitives'
import { type PeriodCategory, type PeriodEntry, periodSheet } from './period-sheet.js'
import { monthBounds } from './week.js'

export interface MonthActualsInput {
  /** Every category the entries name; periodSheet refuses a row naming one not passed in. */
  readonly categories: readonly PeriodCategory[]
  readonly entries: readonly PeriodEntry[]
  /** Each month by its first day, in any order. */
  readonly months: readonly IsoDate[]
}

export interface MonthActuals {
  readonly month: IsoDate
  /** Every category on a list the Month shows, by id. */
  readonly actuals: ReadonlyMap<string, Cents>
}

export function monthActuals(input: MonthActualsInput): { readonly months: readonly MonthActuals[] } {
  return {
    months: input.months.map((month) => {
      const sheet = periodSheet({
        from: month,
        to: monthBounds(month).end,
        categories: input.categories,
        budgets: [],
        plans: [],
        entries: input.entries,
        statementPeriodEnds: [],
        startingBalanceCents: null,
      })
      const rows = Object.values(sheet.blocks).flatMap((block) => block.rows)
      return { month, actuals: new Map(rows.map((r) => [r.categoryId, r.actualCents])) }
    }),
  }
}
