/**
 * A month tab of the workbook, or its Weekly and Paycheck copies, over any window.
 *
 * The workbook fills each block of a month tab with a SUMIFS by category name over a
 * date window. This does the same by category id, for whatever window it is
 * given, so the Month, the Week and a pay period share one set of rules
 * (docs/workbook-views-plan.md §5.1). Nothing here is stored: the screen asks again on
 * every read (CLAUDE.md, never persist a derived money value).
 *
 * Excel semantics (docs/formula-decisions.md):
 *
 * - F4, the window. `Weekly Budget!X22 =SUMIFS(Transactions!D:D, …, ">="&$D$6,
 *   …, "<="&$D$7)`. Both ends are included and only dates are compared. A
 *   window's year is its own, never a month name's (D10). The start is proven
 *   by the sample's rows dated 2025-01-01, Weekly's and Paycheck's D6; the day
 *   after the end is proven left out by Paycheck!X21 (85, not 185).
 * - F5, Left to spend. `Jan!D13 =V21`, the Variable-expenses Budget − Actual
 *   summed; a row with no budget still subtracts its Actual.
 * - F6, the savings sign. `Jan!V10 =U10-T10`: Difference is Actual − Goal, the
 *   opposite sign to a spending row's Remaining, and kept that way.
 * - F16, a missing budget or goal. The workbook reads a blank as 0 everywhere. Where
 *   it has the column the engine does too, as a named branch: a Variable row
 *   with no budget subtracts its whole Actual (V22), and a fund with no goal
 *   shows what was saved (V11), so each column still adds up to its total
 *   (V21, V9). Bills, debts and subscriptions have no Remaining in the workbook; the
 *   app's is Budget − Actual where a budget is set and null where none is.
 *   Income has Goal and Actual only (M8:P16). A budget total (D21, J21, O21,
 *   T21, O9, T9) adds the budgets set, as SUM skips a blank.
 * - F7, Spent and the ending balance. `Jan!D11 =SUM(C19,I19,N19,S19)`: Bills
 *   + Debts + Subscriptions + Variable expenses, never savings. `Jan!D15
 *   =D9+N5-D11-S5`: the typed start + income − spent − saved. The workbook reads a
 *   blank D9 as $0 and still projects from it; here no start typed is no
 *   ending balance (D17), since one counted from a $0 nobody typed is wrong
 *   by the whole bank balance and looks right.
 *
 * - F3 and D5, planned versus real. `Jan!E22 =Bills!D7+SUMIFS(Bills!Q:Q, …)` adds
 *   a bill's Monthly Amount to every payment logged for it. Here a bill, debt
 *   or subscription with any real row in the window shows those rows and its
 *   planned amount is ignored, so a card-paid Netflix counts once (owner's
 *   decision 3). With no real row, the planned amount counts, labelled
 *   'planned'; with neither, nothing.
 * - F8, planned amounts by window. A whole calendar month counts every plan,
 *   as the month tabs never read Bills!B. A partial window counts a plan only
 *   when its due day is one of the window's days (`Weekly Budget!D50`'s
 *   REGEXMATCH), so a blank due day never counts in one. A due day of 29–31
 *   counts on the last day of a shorter month (D6). A window across a month
 *   end can be given each month's amount, which counts on its due day in its
 *   own month (D13), so a rent raised from February is paid at the new
 *   amount on February 1st whichever month the week started in.
 * - F10, which months count planned amounts. The month tabs never gate them
 *   on a date (Dec!E22 is 800 whatever today is), so a month here never
 *   does, and a future month shows its planned bills. Only the Year will
 *   gate, at its asOf, as Annual Budget does.
 * - F17, a row's share, for the charts. Jan chart13 sizes each Variable row
 *   by its Actual and prints no number. `shareBp` is the Actual over the
 *   block's Actuals above zero, half-up, so a row refunds took below zero is
 *   left out of the ring rather than drawn as spending.
 *
 * periodSheet takes plans and budgets already resolved for its window.
 * monthSheet resolves both itself, from everything typed: budgets and goals
 * by resolveBudgets (D12), monthly amounts by resolvePlans (D13), so raising
 * the rent from October leaves September as it was.
 *
 * Card payments (the Not spending list) are in no block and no total; their
 * net is reported alone so the screen can say what was left out (D9). The workbook
 * has no counterpart. Nor has `importedThrough`, the latest statement period
 * end, which says how far a month's card rows can be trusted (migration 0007):
 * taken from the statement, not the latest row, so cash typed today cannot
 * move it.
 *
 * F5 and F7's Spent are proven by workbook-month-summary; budget totals,
 * Remaining and Difference by workbook-month part 1, planned against real by
 * part 2, through the plan history a month resolves, and F7's ending balance
 * by part 3. weekSheet, the Week, by workbook-week; paycheckSheet, the Paycheck
 * view, by workbook-paycheck, in the cells F15 B leaves as the workbook has them.
 *
 * Signs (D3). The ledger is one signed column, outflows negative. The workbook writes
 * every amount positive and knows its direction from the log it sits in, so
 * an Actual here is shown as the workbook shows it: money spent or saved is the
 * negated net of its rows, money received is the net as it stands. A refund
 * nets against its category in the same window and can take it below zero,
 * and that minus sign is kept (D8).
 */
import { type Cents, type IsoDate, ZERO_CENTS, addCents, cents, daysBetween, subCents, sumCents } from '@budget/money-primitives'
import { type BudgetHistoryRow, resolveBudgets } from './budgets.js'
import { type PaySchedule, PAYDAYS_A_YEAR, payPeriod, payShare } from './pay-period.js'
import { type PlanHistoryRow, resolvePlans } from './plans.js'
import { shareOf } from './shares.js'
import { type CategoryKind, monthBounds, shiftMonth, weekBounds } from './week.js'

export interface PeriodCategory {
  readonly id: string
  readonly name: string
  readonly kind: CategoryKind
  /** The workbook's row order on START HERE (migration 0005). */
  readonly sortOrder: number
}

export interface PeriodEntry {
  readonly postedOn: IsoDate
  readonly amountCents: number
  /** Never null: `transactions.category_id` is NOT NULL (0001). */
  readonly categoryId: string
}

/** Already resolved for this window by the caller; null is "no budget", not $0. */
export interface PeriodBudget {
  readonly categoryId: string
  readonly budgetCents: number | null
}

/** A bill's monthly amount, resolved for this window. Null cents: stopped. */
export interface PeriodPlan {
  readonly categoryId: string
  readonly plannedCents: number | null
  /** Day of the month it is paid, 1–31; null when none was typed. */
  readonly dueDay: number | null
  /**
   * The month this amount is in effect for, by its first day, when the
   * window runs across a month end: it then counts only on its due day in
   * that month, so a week holding February 1st pays February's rent, raised
   * or not (D13). Left out, the amount counts on its due day in any month
   * the window touches.
   */
  readonly month?: IsoDate
  /**
   * Already a pay period's share of the month (F15): it counts in the window
   * whatever its due day, as the workbook's ticked Split does, in place of F8.
   */
  readonly spread?: true
}

export interface PeriodSheetInput {
  /** First day of the window, included. */
  readonly from: IsoDate
  /** Last day of the window, included (F4). */
  readonly to: IsoDate
  readonly categories: readonly PeriodCategory[]
  readonly budgets: readonly PeriodBudget[]
  readonly entries: readonly PeriodEntry[]
  readonly plans: readonly PeriodPlan[]
  /** Where each imported statement's period ended, in any order. */
  readonly statementPeriodEnds: readonly IsoDate[]
  /**
   * The bank balance the window started with, as typed (Jan!D9, migration
   * 0010); null when none was, which is never read as $0 (D17).
   */
  readonly startingBalanceCents: number | null
}

export interface MonthSheetInput extends Omit<PeriodSheetInput, 'from' | 'to' | 'budgets' | 'plans'> {
  /** Any day of the month to show. */
  readonly asOf: IsoDate
  /** Every budget and goal typed, for any month (0008); resolved here for this one. */
  readonly budgetHistory: readonly BudgetHistoryRow[]
  /** Every monthly amount and day paid typed, for any month (0009); resolved here for this one. */
  readonly planHistory: readonly PlanHistoryRow[]
}

export interface PeriodRow {
  readonly categoryId: string
  readonly name: string
  /** Budgeted, or on Income and Savings the Goal. Null is no budget, not $0. */
  readonly budgetCents: Cents | null
  /** As the workbook shows it: spent, received or saved, positive; below zero after refunds. */
  readonly actualCents: Cents
  /** What made the Actual: ledger rows, a bill's planned amount (F3), or nothing. */
  readonly basis: 'real' | 'planned' | 'none'
  /**
   * Budget − Actual (Jan!V22), below zero when overspent, on Variable
   * expenses, Bills, Debts and Subscriptions. Null on Income and Savings, and
   * on a bill, debt or subscription with no budget (F16).
   */
  readonly remainingCents: Cents | null
  /** Actual − Goal (F6, Jan!V10), below zero when short of the goal. Savings only; null elsewhere. */
  readonly differenceCents: Cents | null
  /**
   * This row's part of its block, in basis points, for a chart (F17): its
   * Actual over the block's Actuals above zero, half-up. Null when its own
   * Actual is not above zero, which no slice can draw, or nothing is.
   */
  readonly shareBp: number | null
}

export interface PeriodBlock {
  /** Every category on the list, in list order, including those with nothing yet. */
  readonly rows: readonly PeriodRow[]
  /** The rows' budgets or goals added up (Jan!D21, J21, O21, T21, O9, T9); a row with none adds nothing. */
  readonly budgetTotalCents: Cents
  readonly actualTotalCents: Cents
}

/** Variable expenses, whose Remaining column has a total (Jan!V21): Left to spend. */
export interface VariableBlock extends PeriodBlock {
  readonly remainingTotalCents: Cents
}

/** Savings, whose Difference column has a total (Jan!V9): saved − goals. */
export interface SavingsBlock extends PeriodBlock {
  readonly differenceTotalCents: Cents
}

export interface PeriodSheet {
  readonly from: IsoDate
  readonly to: IsoDate
  readonly blocks: {
    readonly income: PeriodBlock
    readonly savings: SavingsBlock
    readonly variable: VariableBlock
    readonly bill: PeriodBlock
    readonly debt: PeriodBlock
    readonly subscription: PeriodBlock
  }
  /** The tab's four summary numbers (Jan!D9, D11, D13, D15), and the two totals D15 reads (N5, S5). */
  readonly summary: {
    /** Jan!D9 as typed, or null when no start was typed. */
    readonly startingBalanceCents: Cents | null
    /** F7: bills, debts, subscriptions and variable expenses; never savings or card payments. */
    readonly spentCents: Cents
    /** F5: the Variable block's Remaining total (Jan!D13 = V21). Below zero when overspent. */
    readonly leftToSpendCents: Cents
    /** Jan!N5 = P9, the Income block's Actual total. */
    readonly incomeCents: Cents
    /** Jan!S5 = U9, the Savings block's Actual total. */
    readonly savedCents: Cents
    /** F7, Jan!D15: start + income − spent − saved. Null with no start typed (D17). Below zero when overdrawn. */
    readonly endingBalanceCents: Cents | null
  }
  /** Net of the Not spending list: positive when money was paid to the card. Never in a total. */
  readonly transfersCents: Cents
  /** The latest statement period end, or null before any statement is imported. */
  readonly importedThrough: IsoDate | null
}

const OWED: ReadonlySet<CategoryKind> = new Set(['bill', 'debt', 'subscription'])

export function periodSheet(input: PeriodSheetInput): PeriodSheet {
  if (input.from > input.to) {
    throw new RangeError(`A window cannot end before it starts: ${input.from} to ${input.to}`)
  }

  const known = new Map(input.categories.map((c) => [c.id, c]))
  const budgets = new Map<string, Cents | null>()
  for (const b of input.budgets) {
    // Refused, as a ledger row is below: a budget left out of its block is a
    // budget total that looks right and is not. A category removed takes its
    // budgets with it (0008), so this is a screen whose categories and
    // budgets were read at different moments. One on Not spending is known,
    // and kept: no block has a row to show it in (N30).
    if (!known.has(b.categoryId)) {
      throw new RangeError(`A budget names category ${b.categoryId}, which was not passed in`)
    }
    if (budgets.has(b.categoryId)) {
      throw new RangeError(`Two budgets for category ${b.categoryId}; resolve them to one before asking`)
    }
    budgets.set(b.categoryId, b.budgetCents === null ? null : cents(b.budgetCents))
  }

  const plans = new Map<string, PeriodPlan[]>()
  for (const p of input.plans) {
    const kind = known.get(p.categoryId)?.kind
    if (kind === undefined || !OWED.has(kind)) {
      throw new RangeError(`A monthly amount for category ${p.categoryId}, which is not a bill, debt or subscription`)
    }
    if (p.month !== undefined && p.month !== monthBounds(p.month).start) {
      throw new RangeError(`A monthly amount's month is named by its first day; received ${p.month}`)
    }
    if (p.month !== undefined && (p.month > input.to || monthBounds(p.month).end < input.from)) {
      throw new RangeError(`A monthly amount for ${p.month}, a month the window does not touch`)
    }
    // One per month named, and a category's amounts either all name their
    // month or it has just one: an unnamed one would count in every month.
    const earlier = plans.get(p.categoryId)
    if (earlier !== undefined && earlier.some((q) => q.month === undefined || p.month === undefined || q.month === p.month)) {
      throw new RangeError(`Two monthly amounts for category ${p.categoryId}; resolve them to one before asking`)
    }
    if (p.dueDay !== null && !(Number.isInteger(p.dueDay) && p.dueDay >= 1 && p.dueDay <= 31)) {
      throw new RangeError(`A due day must be 1 to 31, received ${p.dueDay}`)
    }
    if (p.plannedCents !== null && cents(p.plannedCents) < 0) {
      throw new RangeError(`A monthly amount cannot be negative, received ${p.plannedCents}`)
    }
    if (earlier === undefined) plans.set(p.categoryId, [p])
    else earlier.push(p)
  }
  const wholeMonth = input.from === monthBounds(input.from).start && input.to === monthBounds(input.from).end
  const counts = (p: PeriodPlan): p is PeriodPlan & { plannedCents: number } => {
    if (p.plannedCents === null) return false
    if (wholeMonth || p.spread === true) return true
    if (p.dueDay === null) return false
    return dueInWindow(p.dueDay, input.from, input.to, p.month)
  }
  // Every month's amount paid in the window. Two only when the day paid
  // moved at a month end and both days fall in it: both were paid.
  const plannedHere = (list: readonly PeriodPlan[] | undefined): Cents | null => {
    const paid = (list === undefined ? [] : list).filter(counts)
    return paid.length === 0 ? null : sumCents(paid.map((p) => cents(p.plannedCents)))
  }

  // Rows by category, signed. A row naming a category that was not passed in
  // is refused rather than dropped: a charge missing from every block is a
  // total that looks right and is not. cents() refuses a fraction, so a float
  // that reached this far fails here instead of being summed.
  const byCategory = new Map<string, Cents[]>()
  for (const e of input.entries) {
    if (!known.has(e.categoryId)) {
      throw new RangeError(`A ledger row names category ${e.categoryId}, which was not passed in`)
    }
    const amount = cents(e.amountCents)
    if (e.postedOn < input.from || e.postedOn > input.to) continue
    const list = byCategory.get(e.categoryId)
    if (list === undefined) byCategory.set(e.categoryId, [amount])
    else list.push(amount)
  }

  const block = (kind: CategoryKind): PeriodBlock => {
    const unshared = input.categories
      .filter((c) => c.kind === kind)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((c): Omit<PeriodRow, 'shareBp'> => {
        const real = byCategory.get(c.id)
        const budget = budgets.get(c.id)
        const budgetCents = budget === undefined ? null : budget
        const row = (actualCents: Cents, basis: PeriodRow['basis']) => ({
          categoryId: c.id,
          name: c.name,
          budgetCents,
          actualCents,
          basis,
          remainingCents: remaining(kind, budgetCents, actualCents),
          differenceCents: difference(kind, budgetCents, actualCents),
        })
        if (real !== undefined) {
          const net = sumCents(real)
          // Subtracted from zero, not negated: -0 is not the 0 a screen or a
          // test expects for a purchase and its full refund.
          return row(kind === 'income' ? net : cents(ZERO_CENTS - net), 'real')
        }
        // F3: the planned amount only when no real row is in the window.
        const planned = OWED.has(kind) ? plannedHere(plans.get(c.id)) : null
        return planned === null ? row(ZERO_CENTS, 'none') : row(planned, 'planned')
      })
    // F17: a share is of the rows above zero, so a refund-heavy row is left
    // out of the whole rather than shrinking it, and the slices close a ring.
    const whole = sumCents(unshared.flatMap((r) => (r.actualCents > 0 ? [r.actualCents] : [])))
    const rows = unshared.map(
      (r): PeriodRow => ({ ...r, shareBp: r.actualCents > 0 ? shareOf(r.actualCents, whole) : null }),
    )
    return {
      rows,
      budgetTotalCents: sumCents(present(rows.map((r) => r.budgetCents))),
      actualTotalCents: sumCents(rows.map((r) => r.actualCents)),
    }
  }

  const savings = block('savings')
  const variable = block('variable')
  const blocks = {
    income: block('income'),
    savings: { ...savings, differenceTotalCents: sumCents(present(savings.rows.map((r) => r.differenceCents))) },
    variable: { ...variable, remainingTotalCents: sumCents(present(variable.rows.map((r) => r.remainingCents))) },
    bill: block('bill'),
    debt: block('debt'),
    subscription: block('subscription'),
  }

  const spentCents = sumCents([blocks.bill, blocks.debt, blocks.subscription, blocks.variable].map((b) => b.actualTotalCents))
  const incomeCents = blocks.income.actualTotalCents
  const savedCents = blocks.savings.actualTotalCents
  // cents() refuses a fraction here too, so a typed start that reached this
  // far as a float fails loudly rather than being added in.
  const start = input.startingBalanceCents === null ? null : cents(input.startingBalanceCents)

  return {
    from: input.from,
    to: input.to,
    blocks,
    summary: {
      startingBalanceCents: start,
      spentCents,
      leftToSpendCents: blocks.variable.remainingTotalCents,
      incomeCents,
      savedCents,
      // D17: no start typed is no ending balance, never one counted from $0.
      endingBalanceCents: start === null ? null : subCents(addCents(start, incomeCents), addCents(spentCents, savedCents)),
    },
    transfersCents: sumCents(
      input.categories.flatMap((c) => {
        const rows = byCategory.get(c.id)
        return c.kind === 'transfer' && rows !== undefined ? rows : []
      }),
    ),
    importedThrough: input.statementPeriodEnds.reduce<IsoDate | null>(
      (latest, end) => (latest === null || end > latest ? end : latest),
      null,
    ),
  }
}

/** Remaining, Budget − Actual (Jan!V22), on the lists that spend (F16). */
function remaining(kind: CategoryKind, budget: Cents | null, actual: Cents): Cents | null {
  if (kind === 'variable') {
    // F5 and F16, not a fallback: V22 is T22 − U22 and reads a blank T22 as
    // 0, so a row with no budget still takes its Actual off what is left.
    // The row itself keeps its null budget.
    return budget === null ? subCents(ZERO_CENTS, actual) : subCents(budget, actual)
  }
  // F16: the workbook has no Remaining on these lists. With no budget there is
  // nothing to compare, and 0 − Actual would show Rent as overspent.
  if (OWED.has(kind)) return budget === null ? null : subCents(budget, actual)
  return null
}

/** Difference, Actual − Goal (F6, Jan!V10), on Savings only. */
function difference(kind: CategoryKind, goal: Cents | null, actual: Cents): Cents | null {
  if (kind !== 'savings') return null
  // F16, not a fallback: V11 is U11 − T11 and reads a blank goal as 0, so a
  // fund with no goal shows what went into it.
  return goal === null ? actual : subCents(actual, goal)
}

/** The values that are there; a missing budget adds nothing to a total, as SUM skips a blank. */
function present(values: readonly (Cents | null)[]): Cents[] {
  return values.flatMap((v) => (v === null ? [] : [v]))
}

/**
 * Whether a bill due on `day` of each month falls on one of the window's days.
 * Every month the window touches is checked, so a week across a month end
 * finds the 1st, or only `month` when the amount is that month's. A day the
 * month lacks counts on its last day (D6).
 */
function dueInWindow(day: number, from: IsoDate, to: IsoDate, month: IsoDate | undefined): boolean {
  const final = month === undefined ? to : month
  for (let first = month === undefined ? monthBounds(from).start : month; first <= final; first = shiftMonth(first, 1)) {
    const last = monthBounds(first).end
    const due = `${first.slice(0, 8)}${String(Math.min(day, Number(last.slice(8)))).padStart(2, '0')}`
    if (due >= from && due <= to) return true
  }
  return false
}

/**
 * One of the workbook's month tabs: periodSheet over the calendar month holding `asOf`,
 * with the budgets and goals (D12) and the monthly amounts (D13) in effect
 * that month.
 */
export function monthSheet(input: MonthSheetInput): PeriodSheet {
  const { asOf, budgetHistory, planHistory, ...rest } = input
  const { start, end } = monthBounds(asOf)
  const { budgets } = resolveBudgets({ asOf, history: budgetHistory })
  const plans = plansInEffect(rest.categories, planHistory, asOf)
  return periodSheet({ ...rest, budgets, plans, from: start, to: end })
}

/** The monthly amounts in effect in the month holding `asOf` (D13), on the lists that have them. */
function plansInEffect(
  categories: readonly PeriodCategory[],
  planHistory: readonly PlanHistoryRow[],
  asOf: IsoDate,
): PeriodPlan[] {
  const kinds = new Map(categories.map((c) => [c.id, c.kind]))
  // Refused, as billsTotals refuses it: removing a category removes its
  // amounts (0009), so this is a screen whose categories and amounts were
  // read at different moments, and a month missing a planned bill looks
  // right and is not.
  for (const row of planHistory) {
    if (!kinds.has(row.categoryId)) {
      throw new RangeError(`A monthly amount names category ${row.categoryId}, which was not passed in`)
    }
  }
  // A category counts on the list it is on now. 0009 lets one move off
  // Bills, Debts and Subscriptions once its amount has stopped, keeping its
  // rows, so an amount in effect in an earlier month then counts nowhere, as
  // in billsTotals; periodSheet would refuse it.
  return resolvePlans({ asOf, history: planHistory }).plans.filter((p) => {
    const kind = kinds.get(p.categoryId)
    return kind !== undefined && OWED.has(kind)
  })
}

/** A category as the Week reads it: its one weekly budget, for every week (0004). */
export interface WeekCategory extends PeriodCategory {
  /** Budgeted, or on Income and Savings the Goal (Weekly Budget!D22, Q10, W10). Null is no budget, not $0. */
  readonly weeklyBudgetCents: number | null
}

export interface WeekSheetInput extends Omit<MonthSheetInput, 'asOf' | 'categories' | 'budgetHistory'> {
  /** Any day of the week to show; for this week, today, which sets `daysLeft`. */
  readonly asOf: IsoDate
  readonly categories: readonly WeekCategory[]
}

export interface WeekSheet extends PeriodSheet {
  /** Days from asOf to the week's Sunday, counting asOf itself. */
  readonly daysLeft: number
}

/**
 * The workbook's Weekly Budget: periodSheet over the Monday-to-Sunday week holding
 * `asOf` (D14), not a typed start, so weeks can be stepped through. A bill's
 * planned amount counts only on its due day (F8), at the amount in effect in
 * the month that day is in (D13), so a week across a month end is given
 * each month's. The Budgeted and Goal columns are each category's weekly
 * budget, one value for every week, as Weekly Budget types one set of its
 * own (D22:W44, Q10:Q16, W10:W16) apart from the month tabs'. workbook-week
 * replays its cells.
 */
export function weekSheet(input: WeekSheetInput): WeekSheet {
  const { asOf, planHistory, categories, ...rest } = input
  const { start, end } = weekBounds(asOf)
  const months = [...new Set([monthBounds(start).start, monthBounds(end).start])]
  const plans = months.flatMap((month) =>
    plansInEffect(categories, planHistory, month).map((p): PeriodPlan => ({ ...p, month })),
  )
  const budgets = categories.map((c) => ({ categoryId: c.id, budgetCents: c.weeklyBudgetCents }))
  const sheet = periodSheet({ ...rest, categories, budgets, plans, from: start, to: end })
  return { ...sheet, daysLeft: daysBetween(asOf, end) + 1 }
}

export interface PaycheckSheetInput extends Omit<MonthSheetInput, 'asOf'> {
  /** Any day of the pay period to show. */
  readonly asOf: IsoDate
  /** The income source's schedule the period is found from (0011). */
  readonly schedule: PaySchedule
}

export interface PaycheckSheet extends PeriodSheet {
  /** The month whose amounts and budgets are shared, by its first day: the payday's. */
  readonly month: IsoDate
  /** Paydays a year the monthly amounts are shared across: 52, 26 or 12 (F15). */
  readonly paydaysAYear: number
}

/**
 * The workbook's Paycheck Budget under F15 B (D18): periodSheet over the pay period
 * holding `asOf`, found from the schedule rather than typed. Each monthly
 * amount and each budget and goal in effect in the payday's month (as
 * Paycheck!E50 reads $D$6's) counts as its share of a period, × 12 ÷ paydays
 * a year, whatever its due day. Real rows count as they are, and replace a
 * bill's share (D5). workbook-paycheck replays the cells that still hold.
 */
export function paycheckSheet(input: PaycheckSheetInput): PaycheckSheet {
  const { asOf, schedule, budgetHistory, planHistory, ...rest } = input
  const { start, end } = payPeriod({ schedule, asOf })
  const month = monthBounds(start).start
  const share = (monthlyCents: number | null): Cents | null =>
    monthlyCents === null ? null : payShare({ monthlyCents, frequency: schedule.frequency })
  const budgets = resolveBudgets({ asOf: month, history: budgetHistory }).budgets.map((b) => ({
    categoryId: b.categoryId,
    budgetCents: share(b.budgetCents),
  }))
  const plans = plansInEffect(rest.categories, planHistory, month).map(
    (p): PeriodPlan => ({ ...p, plannedCents: share(p.plannedCents), spread: true }),
  )
  const sheet = periodSheet({ ...rest, budgets, plans, from: start, to: end })
  return { ...sheet, month, paydaysAYear: PAYDAYS_A_YEAR[schedule.frequency] }
}
