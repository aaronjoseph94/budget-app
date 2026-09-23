/**
 * One Workbook month tab, or its Weekly and Paycheck copies, over any window.
 *
 * Workbook fills each block of a month tab with a SUMIFS by category name over a
 * date window. This does the same by category id, for whatever window it is
 * given, so the Month, the Week and a pay period share one set of rules
 * (docs/workbook-plan.md §5.1). Nothing here is stored: the screen asks again on
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
 * - F16, a missing budget or goal. Workbook reads a blank as 0 everywhere. Where
 *   it has the column the engine does too, as a named branch: a Variable row
 *   with no budget subtracts its whole Actual (V22), and a fund with no goal
 *   shows what was saved (V11), so each column still adds up to its total
 *   (V21, V9). Bills, debts and subscriptions have no Remaining in Workbook; the
 *   app's is Budget − Actual where a budget is set and null where none is.
 *   Income has Goal and Actual only (M8:P16). A budget total (D21, J21, O21,
 *   T21, O9, T9) adds the budgets set, as SUM skips a blank.
 * - F7, Spent. `Jan!D11 =SUM(C19,I19,N19,S19)`: Bills + Debts + Subscriptions
 *   + Variable expenses, never savings.
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
 *   counts on the last day of a shorter month (D6).
 * - F10, which months count planned amounts. The month tabs never gate them
 *   on a date (Dec!E22 is 800 whatever today is), so a month here never
 *   does, and a future month shows its planned bills. Only the Year will
 *   gate, at its asOf, as Annual Budget does.
 *
 * periodSheet takes plans and budgets already resolved for its window.
 * monthSheet resolves both itself, from everything typed: budgets and goals
 * by resolveBudgets (D12), monthly amounts by resolvePlans (D13), so raising
 * the rent from October leaves September as it was.
 *
 * Card payments (the Not spending list) are in no block and no total; their
 * net is reported alone so the screen can say what was left out (D9). Workbook
 * has no counterpart. Nor has `importedThrough`, the latest statement period
 * end, which says how far a month's card rows can be trusted (migration 0007):
 * taken from the statement, not the latest row, so cash typed today cannot
 * move it.
 *
 * F5 and F7's Spent are the first half of the tab's summary card, proven by
 * workbook-month-summary; budget totals, Remaining and Difference are proven by
 * workbook-month part 1, and planned against real by part 2, through the plan
 * history a month resolves. F7's ending balance waits for the typed starting
 * balance (Sitting B, S11), and was left out rather than guessed.
 *
 * Signs (D3). The ledger is one signed column, outflows negative. Workbook writes
 * every amount positive and knows its direction from the log it sits in, so
 * an Actual here is shown as Workbook shows it: money spent or saved is the
 * negated net of its rows, money received is the net as it stands. A refund
 * nets against its category in the same window and can take it below zero,
 * and that minus sign is kept (D8).
 */
import { type Cents, type IsoDate, ZERO_CENTS, cents, subCents, sumCents } from '@budget/money-primitives'
import { type BudgetHistoryRow, resolveBudgets } from './budgets.js'
import { type PlanHistoryRow, resolvePlans } from './plans.js'
import { type CategoryKind, monthBounds, shiftMonth } from './week.js'

export interface PeriodCategory {
  readonly id: string
  readonly name: string
  readonly kind: CategoryKind
  /** Workbook's row order on START HERE (migration 0005). */
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
  /** As Workbook shows it: spent, received or saved, positive; below zero after refunds. */
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
  /** The first two of the tab's four summary numbers (Jan!D11, D13); Start and End wait for S11. */
  readonly summary: {
    /** F7: bills, debts, subscriptions and variable expenses; never savings or card payments. */
    readonly spentCents: Cents
    /** F5: the Variable block's Remaining total (Jan!D13 = V21). Below zero when overspent. */
    readonly leftToSpendCents: Cents
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

  const plans = new Map<string, PeriodPlan>()
  for (const p of input.plans) {
    const kind = known.get(p.categoryId)?.kind
    if (kind === undefined || !OWED.has(kind)) {
      throw new RangeError(`A monthly amount for category ${p.categoryId}, which is not a bill, debt or subscription`)
    }
    if (plans.has(p.categoryId)) {
      throw new RangeError(`Two monthly amounts for category ${p.categoryId}; resolve them to one before asking`)
    }
    if (p.dueDay !== null && !(Number.isInteger(p.dueDay) && p.dueDay >= 1 && p.dueDay <= 31)) {
      throw new RangeError(`A due day must be 1 to 31, received ${p.dueDay}`)
    }
    if (p.plannedCents !== null && cents(p.plannedCents) < 0) {
      throw new RangeError(`A monthly amount cannot be negative, received ${p.plannedCents}`)
    }
    plans.set(p.categoryId, p)
  }
  const wholeMonth = input.from === monthBounds(input.from).start && input.to === monthBounds(input.from).end
  const plannedHere = (p: PeriodPlan | undefined): Cents | null => {
    if (p === undefined || p.plannedCents === null) return null
    if (wholeMonth) return cents(p.plannedCents)
    if (p.dueDay === null) return null
    return dueInWindow(p.dueDay, input.from, input.to) ? cents(p.plannedCents) : null
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
    const rows = input.categories
      .filter((c) => c.kind === kind)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((c): PeriodRow => {
        const real = byCategory.get(c.id)
        const budget = budgets.get(c.id)
        const budgetCents = budget === undefined ? null : budget
        const row = (actualCents: Cents, basis: PeriodRow['basis']): PeriodRow => ({
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

  return {
    from: input.from,
    to: input.to,
    blocks,
    summary: {
      spentCents: sumCents([blocks.bill, blocks.debt, blocks.subscription, blocks.variable].map((b) => b.actualTotalCents)),
      leftToSpendCents: blocks.variable.remainingTotalCents,
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
  // F16: Workbook has no Remaining on these lists. With no budget there is
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
 * finds the 1st. A day the month lacks counts on its last day (D6).
 */
function dueInWindow(day: number, from: IsoDate, to: IsoDate): boolean {
  for (let first = monthBounds(from).start; first <= to; first = shiftMonth(first, 1)) {
    const last = monthBounds(first).end
    const due = `${first.slice(0, 8)}${String(Math.min(day, Number(last.slice(8)))).padStart(2, '0')}`
    if (due >= from && due <= to) return true
  }
  return false
}

/**
 * One Workbook month tab: periodSheet over the calendar month holding `asOf`,
 * with the budgets and goals (D12) and the monthly amounts (D13) in effect
 * that month.
 */
export function monthSheet(input: MonthSheetInput): PeriodSheet {
  const { asOf, budgetHistory, planHistory, ...rest } = input
  const { start, end } = monthBounds(asOf)
  const { budgets } = resolveBudgets({ asOf, history: budgetHistory })
  const kinds = new Map(rest.categories.map((c) => [c.id, c.kind]))
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
  const plans = resolvePlans({ asOf, history: planHistory }).plans.filter((p) => {
    const kind = kinds.get(p.categoryId)
    return kind !== undefined && OWED.has(kind)
  })
  return periodSheet({ ...rest, budgets, plans, from: start, to: end })
}
