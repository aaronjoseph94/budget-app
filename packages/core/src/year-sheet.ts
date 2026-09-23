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
 * - F10, the gate. `Hidden!O4 =SUMIFS(Bills!Q:Q, …that month…)+IF(month <=
 *   'Annual Budget'!$D$7, Bills!$D$32, "")`: a bill's planned amount counts
 *   only in months up to and including the month of asOf, Annual's typed
 *   Current Month. Real rows count in every month, as the SUMIFS half does,
 *   and budgets and goals are never gated (Hidden!N4 =Jan!$D$21). Under D5 a
 *   real row still replaces its bill's plan in a month the gate lets through.
 * - D7, the totals. `Annual Budget!J9 =SUM(J10:J16)`, and V9 and W9, add
 *   seven months; `P9 =SUM(P10:P36)` and Q9 run on into the Subscriptions
 *   card below. Every total here adds the twelve rows and nothing else.
 * - The balances. `Annual Budget!D18 =D44`: the start month's typed balance
 *   (Jan!D9 through Hidden!J18), null when none was typed (D17). The ending
 *   balance is F12's `D20 := D18 + D9 − D11 − D13`, start + income − expenses −
 *   savings over the twelve months, where Workbook's `=D9+O6-D11-U6` reads two
 *   blank cells and never adds the start.
 * - F12, Left over. `Annual Budget!D15`, labelled "Left To Spend", is the same
 *   `=D9+O6-D11-U6`. Under decision 15 it is income − expenses − savings,
 *   named "Left over" so it is never taken for the Month's budget remaining
 *   (F5). Below zero when the Year spent and saved more than came in.
 * - F18, at a glance (Home). Workbook ranks categories by twelve times their
 *   monthly amount plus today's calendar year of rows (Hidden!O73, P38:Q40).
 *   Here the top 3 are the Bills, Debts, Subscriptions and Variable expenses
 *   categories with the largest Year Actual, counted as the rows count it;
 *   equals keep Workbook's list order (Hidden!B3:B95), and a share is of every
 *   category above zero, half-up (F17). The best savings month is the one
 *   that saved most, the earliest of equals, as `Hidden!I60`'s QUERY keeps
 *   row order.
 *
 * Proven by workbook-year part 1 (Annual Budget and Hidden, transcribed under
 * F11), with the fixes above, which the sample cannot show, by hand-derived
 * tests.
 */
import { type Cents, type IsoDate, addCents, cents, subCents, sumCents } from '@budget/money-primitives'
import type { BudgetHistoryRow } from './budgets.js'
import { type PeriodBlock, type PeriodCategory, type PeriodEntry, type PeriodSheet, monthSheet } from './period-sheet.js'
import type { PlanHistoryRow } from './plans.js'
import { shareOf } from './shares.js'
import { type CategoryKind, monthBounds, shiftMonth } from './week.js'

export interface StartingBalance {
  /** The month it was typed for, named by its first day (0010). */
  readonly month: IsoDate
  readonly cents: number
}

export interface YearSheetInput {
  /** Any day of the Year's first month (Annual Budget!D6). */
  readonly startMonth: IsoDate
  /** Today, or the day asked about: the last month whose planned bills count (F10). */
  readonly asOf: IsoDate
  readonly categories: readonly PeriodCategory[]
  /** Every budget and goal typed, for any month (0008). */
  readonly budgetHistory: readonly BudgetHistoryRow[]
  /** Every monthly amount typed, for any month (0009). */
  readonly planHistory: readonly PlanHistoryRow[]
  readonly entries: readonly PeriodEntry[]
  /** Every month's typed starting balance (0010); only the start month's is read. */
  readonly startingBalances: readonly StartingBalance[]
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
  /** Whether this month counts its planned bills: at or before the month of asOf (F10). */
  readonly countsPlanned: boolean
}

/** One of Home's top 3 (F18). */
export interface TopExpense {
  readonly categoryId: string
  readonly name: string
  readonly kind: CategoryKind
  /** What the category cost over the Year, as its month rows count it. */
  readonly amountCents: Cents
  /** Its part of every category's Year Actual above zero, half-up (F17). */
  readonly shareBp: number
}

export interface AtAGlance {
  /** Home's "Biggest Expense": the first of the top 3, or null when nothing was spent. */
  readonly biggest: TopExpense | null
  /** At most three, highest first; a category at or below zero is not ranked. */
  readonly top3: readonly TopExpense[]
  /** The month that saved most, the earliest of equals; the first month when none saved. */
  readonly bestSavingsMonth: { readonly month: IsoDate; readonly savedCents: Cents; readonly goalCents: Cents }
}

export interface YearSheet {
  /** The first month's first day. */
  readonly startMonth: IsoDate
  /** Twelve months from the start, in order (F14). */
  readonly months: readonly YearMonth[]
  /** The twelve months added up, each group on its own (D7). */
  readonly totals: YearGroups
  /** Annual Budget!D18: the start month's typed balance, or null when none was typed. */
  readonly startingBalanceCents: Cents | null
  /** F12's D20: start + income − expenses − savings. Null with no start typed (D17). */
  readonly endingBalanceCents: Cents | null
  /** F12, "Left over": income − expenses − savings over the twelve months. Below zero when overspent. */
  readonly leftOverCents: Cents
  readonly atAGlance: AtAGlance
}

/** Workbook's master list order, Hidden!B3:B95, which its QUERY keeps for equal amounts. */
const RANKED = ['variable', 'bill', 'debt', 'subscription'] as const

export function yearSheet(input: YearSheetInput): YearSheet {
  const start = monthBounds(input.startMonth).start
  const gate = monthBounds(input.asOf).start
  // Refused here, as monthSheet refuses it, because the gate hands a later
  // month no plans at all: a stale amount must fail whichever months it hits.
  const known = new Set(input.categories.map((c) => c.id))
  for (const row of input.planHistory) {
    if (!known.has(row.categoryId)) {
      throw new RangeError(`A monthly amount names category ${row.categoryId}, which was not passed in`)
    }
  }

  const sheets: PeriodSheet[] = []
  const months = Array.from({ length: 12 }, (_, i): YearMonth => {
    const month = shiftMonth(start, i)
    const countsPlanned = month <= gate
    const sheet = monthSheet({
      asOf: month,
      categories: input.categories,
      budgetHistory: input.budgetHistory,
      planHistory: countsPlanned ? input.planHistory : [],
      entries: input.entries,
      statementPeriodEnds: [],
      startingBalanceCents: null,
    })
    sheets.push(sheet)
    return { month, countsPlanned, ...groupsOf(sheet) }
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

  const startingBalanceCents = startingBalanceFor(start, input.startingBalances)
  const leftOverCents = subCents(
    totals.income.actualCents,
    addCents(totals.expenses.actualCents, totals.savings.actualCents),
  )
  // Strictly greater, so the earliest of equal months stays.
  const best = months.reduce((b, m) => (m.savings.actualCents > b.savings.actualCents ? m : b))
  return {
    startMonth: start,
    months,
    totals,
    startingBalanceCents,
    // D17: no start typed is no ending balance, never one counted from $0.
    endingBalanceCents: startingBalanceCents === null ? null : addCents(startingBalanceCents, leftOverCents),
    leftOverCents,
    atAGlance: {
      ...topExpenses(sheets),
      bestSavingsMonth: { month: best.month, savedCents: best.savings.actualCents, goalCents: best.savings.budgetCents },
    },
  }
}

/**
 * F18: each spending category's Year Actual, the twelve month rows' Actuals
 * added, ranked. Every sheet lists the same categories, so the first gives
 * the order equals keep: list by Workbook's master order, then row order.
 */
function topExpenses(sheets: readonly PeriodSheet[]): Pick<AtAGlance, 'biggest' | 'top3'> {
  const spent = RANKED.flatMap((kind) =>
    sheets[0]!.blocks[kind].rows.map((first) => ({
      categoryId: first.categoryId,
      name: first.name,
      kind,
      amountCents: sumCents(sheets.map((s) => s.blocks[kind].rows.find((r) => r.categoryId === first.categoryId)!.actualCents)),
    })),
  ).filter((c) => c.amountCents > 0)
  const whole = sumCents(spent.map((c) => c.amountCents))
  // Array.prototype.sort is stable, so equal amounts keep the order above.
  const top3 = [...spent]
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 3)
    .map((c): TopExpense => ({ ...c, shareBp: shareOf(c.amountCents, whole) }))
  return { biggest: top3[0] ?? null, top3 }
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

/** The start month's typed balance. Every row is checked, as 0010 would refuse it. */
function startingBalanceFor(start: IsoDate, balances: readonly StartingBalance[]): Cents | null {
  const seen = new Set<IsoDate>()
  let found: Cents | null = null
  for (const b of balances) {
    if (b.month !== monthBounds(b.month).start) {
      throw new RangeError(`A starting balance is typed for a month, named by its first day; received ${b.month}`)
    }
    if (seen.has(b.month)) throw new RangeError(`Two starting balances for ${b.month}; 0010 keeps one`)
    seen.add(b.month)
    // cents() refuses a fraction, so a float typed start fails loudly here.
    const amount = cents(b.cents)
    if (b.month === start) found = amount
  }
  return found
}
