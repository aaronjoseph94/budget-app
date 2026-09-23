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
 * - F7, Spent. `Jan!D11 =SUM(C19,I19,N19,S19)`: Bills + Debts + Subscriptions
 *   + Variable expenses, never savings.
 *
 * F5–F7 are the tab's summary card. They are not computed yet: each arrives
 * with the slice whose golden cells prove it (plan §8, S7, S10, S11), and a
 * golden assertion has to be seen failing before the code that passes it.
 *
 * Signs (D3). The ledger is one signed column, outflows negative. Workbook writes
 * every amount positive and knows its direction from the log it sits in, so
 * an Actual here is shown as Workbook shows it: money spent or saved is the
 * negated net of its rows, money received is the net as it stands. A refund
 * nets against its category in the same window and can take it below zero,
 * and that minus sign is kept (D8).
 */
import { type Cents, type IsoDate, ZERO_CENTS, cents, sumCents } from '@budget/money-primitives'
import type { CategoryKind } from './week.js'

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

export interface PeriodSheetInput {
  /** First day of the window, included. */
  readonly from: IsoDate
  /** Last day of the window, included (F4). */
  readonly to: IsoDate
  readonly categories: readonly PeriodCategory[]
  readonly budgets: readonly PeriodBudget[]
  readonly entries: readonly PeriodEntry[]
}

export interface PeriodRow {
  readonly categoryId: string
  readonly name: string
  readonly budgetCents: Cents | null
  /** As Workbook shows it: spent, received or saved, positive; below zero after refunds. */
  readonly actualCents: Cents
  /** 'real' when ledger rows in the window made the Actual; 'none' when nothing did. */
  readonly basis: 'real' | 'none'
}

export interface PeriodBlock {
  /** Every category on the list, in list order, including those with nothing yet. */
  readonly rows: readonly PeriodRow[]
  readonly actualTotalCents: Cents
}

export interface PeriodSheet {
  readonly from: IsoDate
  readonly to: IsoDate
  readonly blocks: {
    readonly income: PeriodBlock
    readonly savings: PeriodBlock
    readonly variable: PeriodBlock
  }
}

export function periodSheet(input: PeriodSheetInput): PeriodSheet {
  if (input.from > input.to) {
    throw new RangeError(`A window cannot end before it starts: ${input.from} to ${input.to}`)
  }

  const known = new Map(input.categories.map((c) => [c.id, c]))
  const budgets = new Map<string, Cents | null>()
  for (const b of input.budgets) {
    if (budgets.has(b.categoryId)) {
      throw new RangeError(`Two budgets for category ${b.categoryId}; resolve them to one before asking`)
    }
    budgets.set(b.categoryId, b.budgetCents === null ? null : cents(b.budgetCents))
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
        const net = real === undefined ? ZERO_CENTS : sumCents(real)
        // Subtracted from zero, not negated: -0 is not the 0 a screen or a
        // test expects for a purchase and its full refund.
        const actual = kind === 'income' ? net : cents(ZERO_CENTS - net)
        const budget = budgets.get(c.id)
        return {
          categoryId: c.id,
          name: c.name,
          budgetCents: budget === undefined ? null : budget,
          actualCents: actual,
          basis: real === undefined ? 'none' : 'real',
        }
      })
    return { rows, actualTotalCents: sumCents(rows.map((r) => r.actualCents)) }
  }

  return {
    from: input.from,
    to: input.to,
    blocks: { income: block('income'), savings: block('savings'), variable: block('variable') },
  }
}
