import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { monthSheet, periodSheet, type PeriodCategory, type PeriodEntry, type PeriodPlan } from '../src/period-sheet.js'

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
  cat('rent', 'bill', 0),
  cat('phone', 'bill', 1),
  cat('loan', 'debt', 0),
  cat('music', 'subscription', 0),
]
const row = (postedOn: string, amountCents: number, categoryId: string): PeriodEntry => ({
  postedOn: isoDate(postedOn),
  amountCents,
  categoryId,
})
const BASE = {
  from: isoDate('2026-09-01'),
  to: isoDate('2026-09-30'),
  categories: CATEGORIES,
  budgets: [],
  plans: [],
  entries: [],
  statementPeriodEnds: [],
}
const sheet = (entries: PeriodEntry[], from = '2026-09-01', to = '2026-09-30') =>
  periodSheet({ ...BASE, from: isoDate(from), to: isoDate(to), entries })

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
      ...BASE,
      budgets: [
        { categoryId: 'food', budgetCents: 0 },
        { categoryId: 'fuel', budgetCents: null },
        { categoryId: 'pay', budgetCents: 400_000 },
      ],
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
        ...BASE,
        budgets: [
          { categoryId: 'food', budgetCents: 100 },
          { categoryId: 'food', budgetCents: 200 },
        ],
      }),
    ).toThrow(/Two budgets/)
  })
})

const plan = (categoryId: string, plannedCents: number | null, dueDay: number | null): PeriodPlan => ({
  categoryId,
  plannedCents,
  dueDay,
})
const owed = (plans: PeriodPlan[], entries: PeriodEntry[], from: string, to: string) =>
  periodSheet({ ...BASE, from: isoDate(from), to: isoDate(to), plans, entries })
const actuals = (s: ReturnType<typeof periodSheet>, block: 'bill' | 'debt' | 'subscription') =>
  s.blocks[block].rows.map((r) => [r.categoryId, r.actualCents, r.basis])

describe('periodSheet bills, debts and subscriptions (suite)', () => {
  const PLANS = [plan('rent', 160_000, 1), plan('phone', 6_000, null), plan('loan', 25_000, 20), plan('music', 1_199, 12)]

  it('counts every plan in a whole month, due day or not, and totals the block (F8)', () => {
    const s = owed(PLANS, [], '2026-09-01', '2026-09-30')
    expect(actuals(s, 'bill')).toEqual([
      ['rent', 160_000, 'planned'],
      ['phone', 6_000, 'planned'],
    ])
    expect(s.blocks.bill.actualTotalCents).toBe(166_000)
  })

  it('lets real rows replace the plan, summing all of them, even when they net to zero (F3, D5)', () => {
    const s = owed(
      PLANS,
      [
        row('2026-09-01', -80_000, 'rent'),
        row('2026-09-15', -80_000, 'rent'), // rent paid in halves: 1,600 real, plan ignored
        row('2026-09-12', -1_199, 'music'),
        row('2026-09-13', 1_199, 'music'), // charged and refunded: 0, still real
      ],
      '2026-09-01',
      '2026-09-30',
    )
    expect(actuals(s, 'bill')).toEqual([
      ['rent', 160_000, 'real'],
      ['phone', 6_000, 'planned'],
    ])
    expect(actuals(s, 'subscription')).toEqual([['music', 0, 'real']])
  })

  it('counts a plan in a partial window only on its due day, and never with no day', () => {
    const s = owed(PLANS, [], '2026-09-07', '2026-09-13')
    expect(actuals(s, 'bill')).toEqual([
      ['rent', 0, 'none'],
      ['phone', 0, 'none'],
    ])
    expect(actuals(s, 'debt')).toEqual([['loan', 0, 'none']])
    expect(actuals(s, 'subscription')).toEqual([['music', 1_199, 'planned']])
  })

  it('finds a due day across a month end, and puts 29-31 on a short month\'s last day (D6)', () => {
    const due = (day: number, from: string, to: string) =>
      owed([plan('rent', 100, day)], [], from, to).blocks.bill.rows[0]!.basis
    expect(due(1, '2026-09-28', '2026-10-04')).toBe('planned')
    expect(due(5, '2026-09-28', '2026-10-04')).toBe('none')
    expect(due(1, '2026-09-25', '2026-10-01')).toBe('planned') // the window's last day is the 1st
    // Each window ends on the short month's last day, so a day left unclamped
    // (Feb 31, Apr 31) sorts after the window's end and is missed.
    expect(due(31, '2026-02-22', '2026-02-28')).toBe('planned') // Feb 28
    expect(due(29, '2026-02-22', '2026-02-28')).toBe('planned') // Feb 28, not a leap year
    expect(due(31, '2026-04-24', '2026-04-30')).toBe('planned') // Apr 30
    expect(due(31, '2026-03-23', '2026-03-29')).toBe('none') // March has a 31st
  })

  it('shows nothing for a stopped plan', () => {
    expect(actuals(owed([plan('loan', null, 20)], [], '2026-09-01', '2026-09-30'), 'debt')).toEqual([['loan', 0, 'none']])
  })

  it('keeps card payments out of every block and reports them alone (D9)', () => {
    const s = sheet([
      row('2026-09-05', 10_000, 'card'),
      row('2026-09-20', 5_000, 'card'),
      row('2026-10-01', 7_000, 'card'),
      row('2026-09-06', -2_000, 'food'),
    ])
    expect(s.transfersCents).toBe(15_000)
    expect(s.blocks.variable.actualTotalCents).toBe(2_000)
    expect(s.blocks.income.actualTotalCents).toBe(0)
  })

  it('reads importedThrough from the latest statement end, and null before any', () => {
    const ends = [isoDate('2026-09-07'), isoDate('2026-10-07'), isoDate('2026-08-07')]
    expect(periodSheet({ ...BASE, statementPeriodEnds: ends }).importedThrough).toBe('2026-10-07')
    expect(periodSheet(BASE).importedThrough).toBeNull()
  })

  it('refuses a plan on another list, two plans for one bill, a bad due day and a negative amount', () => {
    const month = (plans: PeriodPlan[]) => () => owed(plans, [], '2026-09-01', '2026-09-30')
    expect(month([plan('food', 100, 1)])).toThrow(/not a bill/)
    expect(month([plan('rent', 100, 1), plan('rent', 200, 1)])).toThrow(/Two monthly amounts/)
    for (const day of [0, 32, 1.5]) expect(month([plan('rent', 100, day)])).toThrow(/due day/)
    for (const amount of [-100, -1]) expect(month([plan('rent', amount, 1)])).toThrow(/negative/)
  })
})

describe('monthSheet (suite)', () => {
  it('runs the calendar month holding asOf, both ends included', () => {
    const s = monthSheet({
      categories: CATEGORIES,
      budgetHistory: [],
      statementPeriodEnds: [],
      asOf: isoDate('2028-02-17'),
      plans: [plan('rent', 160_000, 31)],
      entries: [row('2028-01-31', -100, 'food'), row('2028-02-29', -200, 'food'), row('2028-03-01', -400, 'food')],
    })
    expect([s.from, s.to]).toEqual(['2028-02-01', '2028-02-29'])
    expect(s.blocks.variable.actualTotalCents).toBe(200)
    expect(s.blocks.bill.actualTotalCents).toBe(160_000)
  })
})

describe('periodSheet summary (suite)', () => {
  // Hand-derived. Spent: food 30.00 + 45.00 − 5.00 refund = 70.00; fuel 60.00;
  // rent planned 1,200.00; phone real 40.00 (its 50.00 plan ignored); loan
  // 100.00; music 9.99. 70 + 60 + 1,200 + 40 + 100 + 9.99 = 1,479.99. The pay,
  // the 250.00 to the fund and the 500.00 card payment are in none of it.
  const plans: PeriodPlan[] = [
    { categoryId: 'rent', plannedCents: 120_000, dueDay: 1 },
    { categoryId: 'phone', plannedCents: 5_000, dueDay: 12 },
  ]
  const entries = [
    row('2026-09-02', -3_000, 'food'),
    row('2026-09-10', -4_500, 'food'),
    row('2026-09-11', 500, 'food'),
    row('2026-09-05', -6_000, 'fuel'),
    row('2026-09-12', -4_000, 'phone'),
    row('2026-09-15', -10_000, 'loan'),
    row('2026-09-20', -999, 'music'),
    row('2026-09-15', 300_000, 'pay'),
    row('2026-09-16', -25_000, 'fund'),
    row('2026-09-18', 50_000, 'card'),
  ]
  const summary = (budgets: { categoryId: string; budgetCents: number | null }[]) =>
    periodSheet({ ...BASE, plans, entries, budgets }).summary

  it('adds bills, debts, subscriptions and variable expenses, and nothing else (F7)', () => {
    expect(summary([]).spentCents).toBe(147_999)
  })

  it('subtracts every Variable row, budgeted or not, and keeps the minus sign (F5)', () => {
    // Food 100.00 − 70.00 = 30.00; fuel has no budget, so 0 − 60.00. 30 − 60 = −30.00.
    expect(summary([{ categoryId: 'food', budgetCents: 10_000 }]).leftToSpendCents).toBe(-3_000)
    // Food 100.00 − 70.00 = 30.00; fuel 80.00 − 60.00 = 20.00. The rent budget is not a Variable row.
    expect(
      summary([
        { categoryId: 'food', budgetCents: 10_000 },
        { categoryId: 'fuel', budgetCents: 8_000 },
        { categoryId: 'rent', budgetCents: 1 },
      ]).leftToSpendCents,
    ).toBe(5_000)
  })

  it('with no budgets at all, is minus the Variable spend, as Workbook shows a tab left blank', () => {
    expect(summary([]).leftToSpendCents).toBe(-13_000)
  })

  it('is zero, not minus zero, for an empty window', () => {
    const empty = periodSheet(BASE).summary
    expect(Object.is(empty.spentCents, 0)).toBe(true)
    expect(Object.is(empty.leftToSpendCents, 0)).toBe(true)
  })
})

describe('periodSheet budgets, Remaining and Difference (suite)', () => {
  // Hand-derived, several rows per list. Food 30.00 + 45.00 − 5.00 refund =
  // 70.00 of 100.00: 30.00 left. Fuel 60.00 with no budget: −60.00 (F5).
  // Rent planned 1,200.00 of 1,150.00: −50.00. Phone real 40.00, no budget:
  // no Remaining (F16). Loan 100.00 of 100.00: 0. Music 9.99 of 12.00: 2.01.
  // Pay 3,000.00 of a 2,800.00 goal, bonus 200.00 with none. Fund 300.00 in,
  // 50.00 back out: 250.00 of 400.00, −150.00; trip 80.00 with no goal: 80.00.
  const s = periodSheet({
    ...BASE,
    categories: [...CATEGORIES, cat('trip', 'savings', 1), cat('bonus', 'income', 1)],
    budgets: [
      { categoryId: 'food', budgetCents: 10_000 },
      { categoryId: 'rent', budgetCents: 115_000 },
      { categoryId: 'loan', budgetCents: 10_000 },
      { categoryId: 'music', budgetCents: 1_200 },
      { categoryId: 'pay', budgetCents: 280_000 },
      { categoryId: 'fund', budgetCents: 40_000 },
    ],
    plans: [plan('rent', 120_000, 1), plan('phone', 5_000, 12)],
    entries: [
      row('2026-09-02', -3_000, 'food'),
      row('2026-09-10', -4_500, 'food'),
      row('2026-09-11', 500, 'food'),
      row('2026-09-05', -6_000, 'fuel'),
      row('2026-09-12', -4_000, 'phone'),
      row('2026-09-15', -10_000, 'loan'),
      row('2026-09-20', -999, 'music'),
      row('2026-09-15', 300_000, 'pay'),
      row('2026-09-16', 20_000, 'bonus'),
      row('2026-09-16', -30_000, 'fund'),
      row('2026-09-25', 5_000, 'fund'),
      row('2026-09-17', -8_000, 'trip'),
    ],
  })
  const columns = (block: keyof typeof s.blocks) =>
    s.blocks[block].rows.map((r) => [r.categoryId, r.budgetCents, r.actualCents, r.remainingCents, r.differenceCents])

  it('gives each spending row Budget − Actual, and a bill with no budget none (F5, F16)', () => {
    expect(columns('variable')).toEqual([
      ['fuel', null, 6_000, -6_000, null],
      ['food', 10_000, 7_000, 3_000, null],
    ])
    expect(columns('bill')).toEqual([
      ['rent', 115_000, 120_000, -5_000, null],
      ['phone', null, 4_000, null, null],
    ])
    expect(columns('debt')).toEqual([['loan', 10_000, 10_000, 0, null]])
    expect(columns('subscription')).toEqual([['music', 1_200, 999, 201, null]])
  })

  it('gives each fund Actual − Goal, and a fund with no goal what went into it (F6, F16)', () => {
    expect(columns('savings')).toEqual([
      ['fund', 40_000, 25_000, null, -15_000],
      ['trip', null, 8_000, null, 8_000],
    ])
  })

  it('shows income as goal and actual, with neither Remaining nor Difference', () => {
    expect(columns('income')).toEqual([
      ['pay', 280_000, 300_000, null, null],
      ['bonus', null, 20_000, null, null],
    ])
  })

  it('totals the budgets set on each list, and each column adds up to its own total', () => {
    const { variable, savings, bill, debt, subscription, income } = s.blocks
    expect([variable, bill, debt, subscription, income, savings].map((b) => b.budgetTotalCents)).toEqual([
      10_000, 115_000, 10_000, 1_200, 280_000, 40_000,
    ])
    // V21 = T21 − U21 and V9 = U9 − T9 once each blank reads as Workbook reads it.
    expect(variable.remainingTotalCents).toBe(10_000 - 13_000)
    expect(savings.differenceTotalCents).toBe(33_000 - 40_000)
    expect(s.summary.leftToSpendCents).toBe(variable.remainingTotalCents)
  })

  it('is zero, not minus zero, with nothing budgeted and nothing spent or saved', () => {
    const empty = periodSheet({ ...BASE, budgets: [{ categoryId: 'loan', budgetCents: 0 }] }).blocks
    const zeros = [
      empty.variable.budgetTotalCents,
      empty.variable.remainingTotalCents,
      empty.savings.differenceTotalCents,
      empty.variable.rows[0]!.remainingCents,
      empty.savings.rows[0]!.differenceCents,
      empty.debt.rows[0]!.remainingCents,
    ]
    expect(zeros.every((z) => Object.is(z, 0))).toBe(true)
  })
})
