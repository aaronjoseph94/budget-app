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

export interface BudgetedCategory {
  readonly id: string
  readonly name: string
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
  readonly spentCents: Cents
  readonly inflowCents: Cents
  readonly uncategorisedSpentCents: Cents
  /** Sum of the budgets that are set. Null when none are. */
  readonly budgetCents: Cents | null
  /** What remains across budgeted categories only. Null when none are set. */
  readonly remainingCents: Cents | null
  /** Share of the total budget used, in basis points. Null when none is set. */
  readonly usedBasisPoints: number | null
  /** Largest spending first. Budgeted categories appear even at zero. */
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

  // Net per category, signed. cents() refuses a fraction, so a float that
  // reached this far fails loudly here instead of being summed.
  const net = new Map<string | null, Cents[]>()
  for (const e of inWeek) {
    const list = net.get(e.categoryId) ?? []
    list.push(cents(e.amountCents))
    net.set(e.categoryId, list)
  }
  const netOf = (id: string | null): Cents => sumCents(net.get(id) ?? [])
  const spentOf = (id: string | null): Cents => {
    const n = netOf(id)
    return n < 0 ? cents(-n) : ZERO_CENTS
  }

  const known = new Map(input.categories.map((c) => [c.id, c]))
  const ids = new Set<string>()
  for (const c of input.categories) if (c.weeklyBudgetCents !== null) ids.add(c.id)
  for (const id of net.keys()) if (id !== null && spentOf(id) > 0) ids.add(id)

  const categories: CategoryWeek[] = [...ids].map((id) => {
    const spent = spentOf(id)
    const limit = known.get(id)?.weeklyBudgetCents ?? null
    const budget = limit === null ? null : cents(limit)
    return {
      categoryId: id,
      name: known.get(id)?.name ?? 'Unknown category',
      spentCents: spent,
      budgetCents: budget,
      remainingCents: budget === null ? null : cents(budget - spent),
      usedBasisPoints: budget === null || budget === 0 ? null : Math.floor((spent * 10_000) / budget),
      over: budget !== null && spent > budget,
    }
  })
  categories.sort((a, b) => b.spentCents - a.spentCents || a.name.localeCompare(b.name))

  const budgeted = categories.filter((c) => c.budgetCents !== null)
  const budgetCents = budgeted.length === 0 ? null : sumCents(budgeted.map((c) => c.budgetCents ?? ZERO_CENTS))
  const budgetedSpent = sumCents(budgeted.map((c) => c.spentCents))

  // Uncategorised rows are NOT netted. Netting is right inside a category,
  // where a refund belongs to the purchase it reverses; with no category
  // nothing links the rows, and netting let a $500 card payment silently
  // erase $18 of uncategorised spending from the week's total.
  const loose = (net.get(null) ?? []).filter((a) => a < 0).map((a) => cents(-a))
  const uncategorised = sumCents(loose)

  // Money in: a category that netted positive, plus loose inflows. A refund
  // absorbed by its own category's spending is not money in.
  const inflows = [
    ...[...net.keys()].filter((id): id is string => id !== null).map(netOf).filter((n) => n > 0),
    ...(net.get(null) ?? []).filter((a) => a > 0),
  ]

  return {
    start,
    end,
    daysLeft: daysBetween(input.asOf, end) + 1,
    entryCount: inWeek.length,
    spentCents: sumCents([...categories.map((c) => c.spentCents), uncategorised]),
    inflowCents: sumCents(inflows),
    uncategorisedSpentCents: uncategorised,
    budgetCents,
    remainingCents: budgetCents === null ? null : cents(budgetCents - budgetedSpent),
    usedBasisPoints:
      budgetCents === null || budgetCents === 0 ? null : Math.floor((budgetedSpent * 10_000) / budgetCents),
    categories,
  }
}
