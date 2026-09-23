import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { resolveBudgets, type BudgetHistoryRow } from '../src/budgets.js'
import { monthSheet } from '../src/period-sheet.js'

/**
 * Suite tests, worked by hand. Workbook's sample types one value per month and
 * never "just this month" (workbook-month part 1), so the cases here are the
 * ones no cached cell reaches: an 'only' row among 'onward' rows, an earlier
 * month edited later, and a typed "no budget" (D12).
 */

const typed = (categoryId: string, month: string, applies: 'onward' | 'only', budgetCents: number | null): BudgetHistoryRow => ({
  categoryId,
  month: isoDate(`${month}-01`),
  applies,
  budgetCents,
})
/** What each category resolves to in `month`, read on its 15th; a category with nothing in effect is absent. */
const at = (month: string, history: BudgetHistoryRow[]) =>
  resolveBudgets({ asOf: isoDate(`${month}-15`), history }).budgets.map((b) => [b.categoryId, b.budgetCents])
const foodIn = (months: string[], history: BudgetHistoryRow[]) =>
  months.map((m) => at(m, history).find(([id]) => id === 'food')?.[1])

describe('resolveBudgets (suite)', () => {
  it("lets an 'only' row win its own month, with the 'onward' rows either side holding the rest", () => {
    const history = [
      typed('food', '2026-01', 'onward', 40_000),
      typed('food', '2026-03', 'only', 25_000),
      typed('food', '2026-05', 'onward', 45_000),
    ]
    // Dec: nothing typed yet. Jan–Feb: 400. Mar: 250 just this month. Apr: back to 400. May on: 450.
    const months = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-09']
    const expected = [undefined, 40_000, 40_000, 25_000, 40_000, 45_000, 45_000]
    expect(foodIn(months, history)).toEqual(expected)
    // The database returns rows in no promised order; "latest" is by month, not by position.
    expect(foodIn(months, [...history].reverse())).toEqual(expected)
  })

  it('carries an earlier month edited "from this month on" into later months, up to the next one typed', () => {
    // January typed 400 from then on; March was never typed, so it reads January.
    expect(at('2026-03', [typed('food', '2026-01', 'onward', 40_000)])).toEqual([['food', 40_000]])
    // January edited to 500 from then on replaces January's row (0008's upsert
    // key), and March follows it: nothing was copied into March to go stale.
    expect(at('2026-03', [typed('food', '2026-01', 'onward', 50_000)])).toEqual([['food', 50_000]])
    // A month given its own value "from this month on" takes over from there,
    // and "just this month" in between does not stop January reaching April.
    const history = [
      typed('food', '2026-01', 'onward', 50_000),
      typed('food', '2026-02', 'only', 30_000),
      typed('food', '2026-06', 'onward', 20_000),
    ]
    expect(foodIn(['2026-02', '2026-04', '2026-06'], history)).toEqual([30_000, 50_000, 20_000])
  })

  it('stops carrying forward at a typed "no budget", and starts again at the next amount', () => {
    const history = [
      typed('food', '2026-01', 'onward', 40_000),
      typed('food', '2026-02', 'only', null),
      typed('food', '2026-04', 'onward', null),
      typed('food', '2026-07', 'onward', 20_000),
    ]
    // Null is present, not absent: a typed "no budget" says so.
    expect(at('2026-02', history)).toEqual([['food', null]])
    expect(foodIn(['2026-01', '2026-03', '2026-04', '2026-06', '2026-07'], history)).toEqual([40_000, 40_000, null, null, 20_000])
  })

  it("keeps an 'only' and an 'onward' row typed in the same month apart", () => {
    const history = [typed('food', '2026-03', 'onward', 30_000), typed('food', '2026-03', 'only', 10_000)]
    expect(foodIn(['2026-03', '2026-04'], history)).toEqual([10_000, 30_000])
  })

  it("never reaches back: later rows and other months' 'only' rows leave a month with no budget", () => {
    const history = [typed('food', '2026-03', 'only', 10_000), typed('food', '2026-06', 'onward', 20_000)]
    expect(at('2026-04', history)).toEqual([])
    expect(at('2026-02', history)).toEqual([])
  })

  it('resolves each category on its own, a zero budget included', () => {
    const history = [
      typed('fuel', '2026-01', 'onward', 8_000),
      typed('food', '2026-02', 'onward', 40_000),
      typed('pay', '2026-01', 'onward', 400_000),
      typed('fuel', '2026-03', 'onward', 0),
      typed('pay', '2026-03', 'only', 450_000),
    ]
    expect(at('2026-03', history)).toEqual([
      ['fuel', 0],
      ['food', 40_000],
      ['pay', 450_000],
    ])
  })

  it('refuses a month not named by its first day, a negative or fractional amount, and two rows meaning one thing', () => {
    const resolve = (history: BudgetHistoryRow[]) => () => resolveBudgets({ asOf: isoDate('2026-03-01'), history })
    expect(resolve([{ ...typed('food', '2026-03', 'onward', 100), month: isoDate('2026-03-15') }])).toThrow(/first day/)
    expect(resolve([typed('food', '2026-01', 'onward', -1)])).toThrow(/negative/)
    expect(resolve([typed('food', '2026-01', 'only', 10.5)])).toThrow(RangeError)
    expect(resolve([typed('food', '2026-01', 'onward', 100), typed('food', '2026-01', 'onward', 200)])).toThrow(/Two 'onward'/)
  })
})

describe('monthSheet budgets (suite)', () => {
  it('resolves the history for the month it shows', () => {
    const month = (asOf: string) =>
      monthSheet({
        asOf: isoDate(asOf),
        categories: [{ id: 'food', name: 'Food', kind: 'variable', sortOrder: 0 }],
        budgetHistory: [typed('food', '2026-01', 'onward', 10_000), typed('food', '2026-03', 'only', 5_000)],
        plans: [],
        entries: [],
        statementPeriodEnds: [],
      }).blocks.variable.rows[0]!.budgetCents
    expect([month('2025-12-31'), month('2026-02-28'), month('2026-03-31'), month('2026-04-01')]).toEqual([null, 10_000, 5_000, 10_000])
  })
})
