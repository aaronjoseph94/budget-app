/**
 * How the week is going: spending against budget, by category.
 *
 * NOT workbook-derived. The workbook is month-first because a spreadsheet
 * cannot filter; docs/ROADMAP.md makes weekly the primary lens as a new
 * capability. Tests are therefore worked by hand rather than golden-replayed.
 *
 * Every figure the week screen shows comes from here. Invariant 1: the screen
 * formats these numbers and never adds anything up itself, and nothing here is
 * ever stored — it is recomputed from the ledger on every read.
 *
 * Amounts are signed (docs/divergences.md D3): outflows negative. "Spent" is
 * reported as a positive number because that is how a person reads it, and a
 * category's spending is NET of refunds within the week — a $30 return on a
 * $45 purchase is $15 spent, not $45 spent and $30 of income.
 *
 * Which of Workbook's lists a category is on decides what its rows are (Workbook
 * plan §5.1, S3b). Bills, debts, subscriptions and variable expenses are
 * spending, netted and signed as the Month will be, so a week with only a
 * return shows negative spending instead of vanishing. Money in is the Income
 * list only. Savings moves and transfers are neither: paying off the card
 * moves money, and what it paid for was counted when it was bought (D9).
 * Transfers are reported on their own so the screen can say they were left
 * out.
 */
import {
  type Cents,
  type IsoDate,
  ZERO_CENTS,
  addDays,
  addMonths,
  cents,
  daysBetween,
  sumCents,
} from '@budget/money-primitives'

export interface LedgerEntry {
  readonly postedOn: IsoDate
  readonly amountCents: number
  /** Null for a row nobody has categorised yet. */
  readonly categoryId: string | null
}

/** Workbook's lists (migration 0005's category_kind), as core names them. */
export type CategoryKind = 'income' | 'savings' | 'bill' | 'debt' | 'subscription' | 'variable' | 'transfer'

/** The lists whose rows are spending. */
const SPENDING: ReadonlySet<CategoryKind> = new Set(['bill', 'debt', 'subscription', 'variable'])

export interface BudgetedCategory {
  readonly id: string
  readonly name: string
  readonly kind: CategoryKind
  /** Null when the user has set no limit — which is not the same as zero. */
  readonly weeklyBudgetCents: number | null
}

export interface WeeklySummaryInput {
  readonly entries: readonly LedgerEntry[]
  readonly categories: readonly BudgetedCategory[]
  readonly asOf: IsoDate
}

export interface CategoryWeek {
  readonly categoryId: string
  readonly name: string
  readonly spentCents: Cents
  readonly budgetCents: Cents | null
  /** Budget minus spent; negative when over. Null when there is no budget. */
  readonly remainingCents: Cents | null
  /** Share of the budget used, in basis points (10,000 = all of it). */
  readonly usedBasisPoints: number | null
  readonly over: boolean
}

export interface WeeklySummary {
  readonly start: IsoDate
  readonly end: IsoDate
  /** Days from asOf to the end of the week, counting asOf itself. */
  readonly daysLeft: number
  readonly entryCount: number
  /** Spending lists plus uncategorised outflows. Negative in a week of returns. */
  readonly spentCents: Cents
  /** The Income list, net. */
  readonly inflowCents: Cents
  /** The Not spending list, net: positive when money was paid to the card. Never in a total. */
  readonly transfersCents: Cents
  readonly uncategorisedSpentCents: Cents
  /** Uncategorised inflows. Nothing says what they are, so no total counts them. */
  readonly uncategorisedInCents: Cents
  /** Sum of the budgets that are set. Null when none are. */
  readonly budgetCents: Cents | null
  /** What remains across budgeted categories only. Null when none are set. */
  readonly remainingCents: Cents | null
  /** Share of the total budget used, in basis points. Null when none is set. */
  readonly usedBasisPoints: number | null
  /**
   * Spending lists only, largest first. A category appears when it has a
   * row this week or a budget, so a return shows even though it nets below zero.
   */
  readonly categories: readonly CategoryWeek[]
}

/** A known Monday, used to find the day of the week without a clock. */
const A_MONDAY = '1970-01-05' as IsoDate

/**
 * The Monday-to-Sunday week containing `date`.
 *
 * Monday-first because that is where a working week and a weekend belong
 * together: a Sunday-first week splits Saturday from Sunday, and the weekend is
 * where most discretionary spending happens.
 */
export function weekBounds(date: IsoDate): { start: IsoDate; end: IsoDate } {
  const offset = ((daysBetween(A_MONDAY, date) % 7) + 7) % 7
  const start = addDays(date, -offset)
  return { start, end: addDays(start, 6) }
}

/** The calendar month containing `date`, first day to last. */
export function monthBounds(date: IsoDate): { start: IsoDate; end: IsoDate } {
  const start = `${date.slice(0, 7)}-01` as IsoDate
  return { start, end: addDays(addMonths(start, 1), -1) }
}

/**
 * The first of the month `months` away. Stepped from the 1st so that a
 * 31st never skips a shorter month on the way.
 */
export function shiftMonth(date: IsoDate, months: number): IsoDate {
  return addMonths(`${date.slice(0, 7)}-01` as IsoDate, months)
}

/** The same weekday, `weeks` weeks away. For stepping between weeks. */
export function shiftWeek(date: IsoDate, weeks: number): IsoDate {
  return addDays(date, weeks * 7)
}

export function weeklySummary(input: WeeklySummaryInput): WeeklySummary {
  const { start, end } = weekBounds(input.asOf)
  const inWeek = input.entries.filter((e) => e.postedOn >= start && e.postedOn <= end)
  const known = new Map(input.categories.map((c) => [c.id, c]))

  // Rows by category, signed. A row whose category is missing, or not one
  // this list knows, has no list to say what it is, so it is loose. cents()
  // refuses a fraction, so a float that reached this far fails loudly here
  // instead of being summed.
  const byCategory = new Map<string, Cents[]>()
  const loose: Cents[] = []
  for (const e of inWeek) {
    const amount = cents(e.amountCents)
    if (e.categoryId === null || !known.has(e.categoryId)) {
      loose.push(amount)
      continue
    }
    const list = byCategory.get(e.categoryId)
    if (list === undefined) byCategory.set(e.categoryId, [amount])
    else list.push(amount)
  }
  const netOf = (id: string): Cents => {
    const list = byCategory.get(id)
    return list === undefined ? ZERO_CENTS : sumCents(list)
  }
  const netOn = (kind: CategoryKind): Cents =>
    sumCents(input.categories.filter((c) => c.kind === kind).map((c) => netOf(c.id)))

  const categories: CategoryWeek[] = input.categories
    .filter((c) => SPENDING.has(c.kind) && (c.weeklyBudgetCents !== null || byCategory.has(c.id)))
    .map((c) => {
      // Signed: a return with no purchase this week is negative spending.
      // Subtracted from zero, not negated: -0 is not the 0 a test or a
      // screen expects for a purchase and its full return.
      const spent = cents(ZERO_CENTS - netOf(c.id))
      const budget = c.weeklyBudgetCents === null ? null : cents(c.weeklyBudgetCents)
      return {
        categoryId: c.id,
        name: c.name,
        spentCents: spent,
        budgetCents: budget,
        remainingCents: budget === null ? null : cents(budget - spent),
        usedBasisPoints: budget === null || budget === 0 ? null : Math.floor((spent * 10_000) / budget),
        over: budget !== null && spent > budget,
      }
    })
  categories.sort((a, b) => b.spentCents - a.spentCents || a.name.localeCompare(b.name))

  // Only rows with a budget count against the budget. Collected with the
  // null case as its own branch: a missing budget is not a zero one.
  const budgets: Cents[] = []
  const budgetedSpent: Cents[] = []
  for (const c of categories) {
    if (c.budgetCents === null) continue
    budgets.push(c.budgetCents)
    budgetedSpent.push(c.spentCents)
  }
  const budgetCents = budgets.length === 0 ? null : sumCents(budgets)
  const spentAgainstBudget = sumCents(budgetedSpent)

  // Loose rows are NOT netted. Netting is right inside a category, where a
  // refund belongs to the purchase it reverses; with no category nothing
  // links the rows, and netting let a $500 card payment silently erase $18
  // of uncategorised spending from the week's total.
  const uncategorised = sumCents(loose.filter((a) => a < 0).map((a) => cents(-a)))

  return {
    start,
    end,
    daysLeft: daysBetween(input.asOf, end) + 1,
    entryCount: inWeek.length,
    spentCents: sumCents([...categories.map((c) => c.spentCents), uncategorised]),
    inflowCents: netOn('income'),
    transfersCents: netOn('transfer'),
    uncategorisedSpentCents: uncategorised,
    uncategorisedInCents: sumCents(loose.filter((a) => a > 0)),
    budgetCents,
    remainingCents: budgetCents === null ? null : cents(budgetCents - spentAgainstBudget),
    usedBasisPoints:
      budgetCents === null || budgetCents === 0 ? null : Math.floor((spentAgainstBudget * 10_000) / budgetCents),
    categories,
  }
}
