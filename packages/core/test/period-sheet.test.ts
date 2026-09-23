import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { periodSheet, type PeriodCategory, type PeriodEntry } from '../src/period-sheet.js'

/**
 * Suite tests, worked by hand from the invented rows below. Workbook's cached
 * cells each hold one row (workbook-period part 1), so an engine that summed only
 * the first row would pass them; these catch that, and the cases no cached
 * cell reaches (plan §5.3).
 */

const cat = (id: string, kind: PeriodCategory['kind'], sortOrder: number): PeriodCategory => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  kind,
  sortOrder,
})
const CATEGORIES = [
  cat('food', 'variable', 1),
  cat('fuel', 'variable', 0),
  cat('pay', 'income', 0),
  cat('fund', 'savings', 0),
  cat('card', 'transfer', 0),
]
const row = (postedOn: string, amountCents: number, categoryId: string): PeriodEntry => ({
  postedOn: isoDate(postedOn),
  amountCents,
  categoryId,
})
const sheet = (entries: PeriodEntry[], from = '2026-09-01', to = '2026-09-30') =>
  periodSheet({ from: isoDate(from), to: isoDate(to), categories: CATEGORIES, budgets: [], entries })

describe('periodSheet (suite)', () => {
  it('sums every row of a category, nets refunds, and totals the block', () => {
    const s = sheet([
      row('2026-09-02', -3_000, 'food'),
      row('2026-09-10', -4_500, 'food'),
      row('2026-09-11', 1_000, 'food'), // refund: food is 30 + 45 − 10 = 65.00
      row('2026-09-12', -2_000, 'fuel'),
      row('2026-09-15', 250_000, 'pay'),
      row('2026-09-16', 50_000, 'pay'), // 2,500 + 500 received
      row('2026-09-20', -30_000, 'fund'),
      row('2026-09-21', -20_000, 'fund'), // 300 + 200 saved
    ])
    expect(s.blocks.variable.rows.map((r) => [r.categoryId, r.actualCents, r.basis])).toEqual([
      ['fuel', 2_000, 'real'],
      ['food', 6_500, 'real'],
    ])
    expect(s.blocks.variable.actualTotalCents).toBe(8_500)
    expect(s.blocks.income.actualTotalCents).toBe(300_000)
    expect(s.blocks.savings.actualTotalCents).toBe(50_000)
  })

  it('includes the last day of the window and leaves out the day after (F4)', () => {
    const s = sheet([row('2026-09-30', -1_000, 'food'), row('2026-10-01', -9_000, 'food')])
    expect(s.blocks.variable.actualTotalCents).toBe(1_000)
  })

  it('keeps the minus sign when refunds beat purchases, and gives 0 not -0 when they cancel (D8)', () => {
    const s = sheet([row('2026-09-03', 2_500, 'food'), row('2026-09-04', -1_200, 'fuel'), row('2026-09-05', 1_200, 'fuel')])
    const [fuel, food] = s.blocks.variable.rows
    expect(food!.actualCents).toBe(-2_500)
    expect(Object.is(fuel!.actualCents, 0)).toBe(true)
    expect(fuel!.basis).toBe('real')
  })

  it('lists every category on a list, with nothing on it yet, and none from other lists', () => {
    const s = sheet([row('2026-09-03', 10_000, 'card')])
    expect(s.blocks.variable.rows.map((r) => [r.categoryId, r.actualCents, r.basis])).toEqual([
      ['fuel', 0, 'none'],
      ['food', 0, 'none'],
    ])
    expect(s.blocks.income.rows.map((r) => r.categoryId)).toEqual(['pay'])
  })

  it('passes a resolved budget through, and keeps no budget apart from a zero one', () => {
    const s = periodSheet({
      from: isoDate('2026-09-01'),
      to: isoDate('2026-09-30'),
      categories: CATEGORIES,
      budgets: [
        { categoryId: 'food', budgetCents: 0 },
        { categoryId: 'fuel', budgetCents: null },
        { categoryId: 'pay', budgetCents: 400_000 },
      ],
      entries: [],
    })
    expect(s.blocks.variable.rows.map((r) => r.budgetCents)).toEqual([null, 0])
    expect(s.blocks.income.rows[0]!.budgetCents).toBe(400_000)
    expect(s.blocks.savings.rows[0]!.budgetCents).toBeNull()
  })

  it('refuses a row whose category was not passed in, even outside the window', () => {
    expect(() => sheet([row('2025-01-01', -100, 'gone')])).toThrow(/category gone/)
  })

  it('refuses a fractional amount, a backwards window and two budgets for one category', () => {
    expect(() => sheet([row('2026-09-02', -10.5, 'food')])).toThrow(RangeError)
    expect(() => sheet([], '2026-09-30', '2026-09-01')).toThrow(/cannot end before/)
    expect(() =>
      periodSheet({
        from: isoDate('2026-09-01'),
        to: isoDate('2026-09-30'),
        categories: CATEGORIES,
        budgets: [
          { categoryId: 'food', budgetCents: 100 },
          { categoryId: 'food', budgetCents: 200 },
        ],
        entries: [],
      }),
    ).toThrow(/Two budgets/)
  })
})
