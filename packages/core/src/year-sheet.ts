/**
 * Workbook's Annual Budget: twelve month rows from a chosen start month, each
 * one Workbook month tab's block totals, and the year's totals beside them.
 *
 * Each row is monthSheet over that month, so the Year counts a charge, a
 * refund, a planned bill and a budget exactly as the Month does; nothing here
 * sums a ledger row itself. Nothing is stored: the screen asks again on every
 * read (CLAUDE.md, never persist a derived money value).
 *
 * Excel semantics (docs/formula-decisions.md, docs/divergences.md):
 *
 * - F14, the span. `Annual Budget!I10 =D6`, `I11 =DATE(YEAR(I10),MONTH(I10)
 *   +1,DAY(I10))`: twelve months from a typed start month, crossing a year
 *   end when the start is not January. The start is read as its month, so a
 *   start typed on the 31st cannot skip a short month as DATE's overflow does.
 * - D10, one year. Annual reads the month tabs by month name alone
 *   (`Hidden!J4 =Jan!$O$9`), so a 2025 heading shows 2026 tabs. Here each row
 *   is its own month of its own year.
 * - The row figures. Income Goal and Actual are the Income block's totals
 *   (Hidden!J4, K4 = Jan!O9, N5); Savings the Savings block's (L4, M4 = T9,
 *   U9); each of Bills, Debts, Subscriptions and Variable expenses its block's
 *   Budgeted and Actual (Hidden!N4:U4). Expenses are the four added
 *   (`Annual Budget!P10 =D30+J30+P30+V30`, `Q10 =E30+K30+Q30+W30`); savings
 *   are not an expense, as on the month tab (F7).
 * - D7, the totals. `Annual Budget!J9 =SUM(J10:J16)`, and V9 and W9, add
 *   seven months; `P9 =SUM(P10:P36)` and Q9 run on into the Subscriptions
 *   card below. Every total here adds the twelve rows and nothing else.
 *
 * Proven by workbook-year part 1 (Annual Budget, transcribed under F11), and
 * the D7 fixes, which the sample cannot show, by hand-derived tests.
 */
import { type Cents, type IsoDate, sumCents } from '@budget/money-primitives'
import type { BudgetHistoryRow } from './budgets.js'
import { type PeriodBlock, type PeriodCategory, type PeriodEntry, type PeriodSheet, monthSheet } from './period-sheet.js'
import type { PlanHistoryRow } from './plans.js'
import { monthBounds, shiftMonth } from './week.js'

export interface YearSheetInput {
  /** Any day of the Year's first month (Annual Budget!D6). */
  readonly startMonth: IsoDate
  readonly categories: readonly PeriodCategory[]
  /** Every budget and goal typed, for any month (0008). */
  readonly budgetHistory: readonly BudgetHistoryRow[]
  /** Every monthly amount typed, for any month (0009). */
  readonly planHistory: readonly PlanHistoryRow[]
  readonly entries: readonly PeriodEntry[]
}

/** One group's figures. On Income and Savings the budget is Workbook's Goal. */
export interface YearFigure {
  readonly budgetCents: Cents
  readonly actualCents: Cents
}

export interface YearGroups {
  readonly income: YearFigure
  /** Bills + Debts + Subscriptions + Variable expenses (Annual Budget!P10, Q10). */
  readonly expenses: YearFigure
  readonly savings: YearFigure
  readonly bill: YearFigure
  readonly debt: YearFigure
  readonly subscription: YearFigure
  readonly variable: YearFigure
}

export interface YearMonth extends YearGroups {
  /** The month's first day. */
  readonly month: IsoDate
}

export interface YearSheet {
  /** The first month's first day. */
  readonly startMonth: IsoDate
  /** Twelve months from the start, in order (F14). */
  readonly months: readonly YearMonth[]
  /** The twelve months added up, each group on its own (D7). */
  readonly totals: YearGroups
}

export function yearSheet(input: YearSheetInput): YearSheet {
  const start = monthBounds(input.startMonth).start

  const months = Array.from({ length: 12 }, (_, i): YearMonth => {
    const month = shiftMonth(start, i)
    const sheet = monthSheet({
      asOf: month,
      categories: input.categories,
      budgetHistory: input.budgetHistory,
      planHistory: input.planHistory,
      entries: input.entries,
      statementPeriodEnds: [],
      startingBalanceCents: null,
    })
    return { month, ...groupsOf(sheet) }
  })

  const total = (g: keyof YearGroups): YearFigure => ({
    budgetCents: sumCents(months.map((m) => m[g].budgetCents)),
    actualCents: sumCents(months.map((m) => m[g].actualCents)),
  })
  const totals: YearGroups = {
    income: total('income'),
    expenses: total('expenses'),
    savings: total('savings'),
    bill: total('bill'),
    debt: total('debt'),
    subscription: total('subscription'),
    variable: total('variable'),
  }

  return { startMonth: start, months, totals }
}

function figure(block: PeriodBlock): YearFigure {
  return { budgetCents: block.budgetTotalCents, actualCents: block.actualTotalCents }
}

function groupsOf(sheet: PeriodSheet): YearGroups {
  const owed = [sheet.blocks.bill, sheet.blocks.debt, sheet.blocks.subscription, sheet.blocks.variable]
  return {
    income: figure(sheet.blocks.income),
    expenses: {
      budgetCents: sumCents(owed.map((b) => b.budgetTotalCents)),
      actualCents: sumCents(owed.map((b) => b.actualTotalCents)),
    },
    savings: figure(sheet.blocks.savings),
    bill: figure(sheet.blocks.bill),
    debt: figure(sheet.blocks.debt),
    subscription: figure(sheet.blocks.subscription),
    variable: figure(sheet.blocks.variable),
  }
}
