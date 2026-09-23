/**
 * Which budget or goal is in effect in a month, from what was typed and how.
 *
 * Workbook types twelve separate sets of budgets and goals, one per month tab
 * (Jan..Dec D22:D44, J22:J44, O22:O44, T22:T44, O10:O16, T10:T16), and its
 * sample fills only January: February to December are typed 0 or left blank.
 * Retyping twelve months a year is the work the app exists to remove, so it
 * stores what the owner meant instead (migration 0008, D12): "from this month
 * on" is an 'onward' row for the month it was typed in, and "just this month"
 * is an 'only' row.
 *
 * The rule, for each category and the month asked about (plan §4):
 * 1. an 'only' row for exactly that month wins;
 * 2. otherwise the latest 'onward' row at or before that month applies;
 * 3. otherwise there is no budget.
 * A winning row with no amount is a typed "no budget". It stops an earlier
 * amount carrying forward, which leaving a month untyped cannot do.
 *
 * Nothing is copied into later months. A copy would go stale the moment an
 * earlier month was edited "from this month on"; resolving on every read
 * lets that edit reach each later month not given a value of its own, and
 * keeps Workbook's property that editing October never rewrites January.
 *
 * Income goals and savings goals are the same kind of number, and resolve
 * the same way.
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import { monthBounds } from './week.js'

export interface BudgetHistoryRow {
  readonly categoryId: string
  /** The first day of the month it was typed for; 0008 refuses any other day. */
  readonly month: IsoDate
  readonly applies: 'onward' | 'only'
  /** Null is a typed "no budget", not $0. */
  readonly budgetCents: number | null
}

export interface ResolveBudgetsInput {
  /** Any day of the month to resolve. */
  readonly asOf: IsoDate
  /** Every row typed, for any month, in any order. */
  readonly history: readonly BudgetHistoryRow[]
}

export interface ResolvedBudget {
  readonly categoryId: string
  /** Null when the row in effect is a typed "no budget". */
  readonly budgetCents: Cents | null
}

export interface ResolveBudgetsOutput {
  /** One per category with a row in effect, in the order the history first names them. A category with none is absent. */
  readonly budgets: readonly ResolvedBudget[]
}

export function resolveBudgets(input: ResolveBudgetsInput): ResolveBudgetsOutput {
  const month = monthBounds(input.asOf).start
  const only = new Map<string, BudgetHistoryRow>()
  const onward = new Map<string, BudgetHistoryRow>()
  const named = new Set<string>()
  const seen = new Set<string>()

  // Every row is checked, not only those that could apply, so a history the
  // database would refuse is refused here whichever month is asked for.
  for (const row of input.history) {
    if (row.month !== monthBounds(row.month).start) {
      throw new RangeError(`A budget is typed for a month, named by its first day; received ${row.month}`)
    }
    if (row.budgetCents !== null && cents(row.budgetCents) < 0) {
      throw new RangeError(`A budget cannot be negative, received ${row.budgetCents}`)
    }
    const key = `${row.categoryId}|${row.month}|${row.applies}`
    if (seen.has(key)) {
      throw new RangeError(`Two '${row.applies}' budgets for category ${row.categoryId} in ${row.month}; 0008 keeps one`)
    }
    seen.add(key)
    named.add(row.categoryId)

    if (row.applies === 'only') {
      if (row.month === month) only.set(row.categoryId, row)
    } else if (row.month <= month) {
      const latest = onward.get(row.categoryId)
      if (latest === undefined || row.month > latest.month) onward.set(row.categoryId, row)
    }
  }

  const budgets: ResolvedBudget[] = []
  for (const categoryId of named) {
    const inEffect = only.get(categoryId) ?? onward.get(categoryId)
    if (inEffect === undefined) continue
    budgets.push({ categoryId, budgetCents: inEffect.budgetCents === null ? null : cents(inEffect.budgetCents) })
  }
  return { budgets }
}
