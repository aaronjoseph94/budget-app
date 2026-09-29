import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { monthSheet, periodSheet, weekSheet, type PeriodCategory, type PeriodEntry, type PeriodPlan } from '../src/period-sheet.js'
import { resolvePlans } from '../src/plans.js'

/**
 * Suite tests, worked by hand from the invented rows below. The workbook's cached
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
  startingBalanceCents: null,
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

  it('refuses a budget whose category was not passed in, and shows one on Not spending in no block (N30)', () => {
    expect(() => periodSheet({ ...BASE, budgets: [{ categoryId: 'gone', budgetCents: 100 }] })).toThrow(/category gone/)
    // 0008 keeps a budget when its category moves to Not spending; no block has a row for it.
    const s = periodSheet({ ...BASE, budgets: [{ categoryId: 'card', budgetCents: 5_000 }] })
    expect(Object.values(s.blocks).map((b) => b.budgetTotalCents)).toEqual([0, 0, 0, 0, 0, 0])
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

describe('periodSheet across a month end, a plan per month (suite)', () => {
  const inMonth = (month: string, plannedCents: number | null, dueDay: number | null): PeriodPlan => ({
    ...plan('rent', plannedCents, dueDay),
    month: isoDate(`${month}-01`),
  })
  const rent = (plans: PeriodPlan[], entries: PeriodEntry[] = []) =>
    owed(plans, entries, '2026-01-26', '2026-02-01').blocks.bill.rows[0]

  it("counts the rent due on the 1st at February's amount when it was raised from February (D13)", () => {
    const plans = [inMonth('2026-01', 160_000, 1), inMonth('2026-02', 170_000, 1)]
    expect(rent(plans)).toMatchObject({ actualCents: 170_000, basis: 'planned' })
    // Each month's amount is looked for on its own due day in that month:
    // January's 1st is outside this week, so January's amount is not counted.
    expect(rent([inMonth('2026-01', 160_000, 1)])).toMatchObject({ actualCents: 0, basis: 'none' })
  })

  it('counts both when the day paid moved and each month has its day in the window', () => {
    // January's amount due on the 30th, February's on the 1st: both are paid this week.
    const plans = [inMonth('2026-01', 160_000, 30), inMonth('2026-02', 170_000, 1)]
    expect(rent(plans)).toMatchObject({ actualCents: 330_000, basis: 'planned' })
    // A stopped month adds nothing, and a real row still replaces every plan (D5).
    expect(rent([inMonth('2026-01', 160_000, 30), inMonth('2026-02', null, 1)])).toMatchObject({ actualCents: 160_000 })
    expect(rent(plans, [row('2026-01-30', -150_000, 'rent')])).toMatchObject({ actualCents: 150_000, basis: 'real' })
  })

  it('refuses two amounts for one month, one with a month beside one without, and a month the window misses', () => {
    const week = (plans: PeriodPlan[]) => () => rent(plans)
    expect(week([inMonth('2026-02', 100, 1), inMonth('2026-02', 200, 1)])).toThrow(/Two monthly amounts/)
    expect(week([plan('rent', 100, 1), inMonth('2026-02', 200, 1)])).toThrow(/Two monthly amounts/)
    expect(week([inMonth('2026-03', 100, 1)])).toThrow(/does not touch/)
    expect(week([{ ...plan('rent', 100, 1), month: isoDate('2026-02-02') }])).toThrow(/first day/)
  })
})

describe('monthSheet (suite)', () => {
  it('runs the calendar month holding asOf, both ends included', () => {
    const s = monthSheet({
      categories: CATEGORIES,
      budgetHistory: [],
      statementPeriodEnds: [],
      startingBalanceCents: null,
      asOf: isoDate('2028-02-17'),
      planHistory: [{ ...plan('rent', 160_000, 31), effectiveMonth: isoDate('2028-02-01') }],
      entries: [row('2028-01-31', -100, 'food'), row('2028-02-29', -200, 'food'), row('2028-03-01', -400, 'food')],
    })
    expect([s.from, s.to]).toEqual(['2028-02-01', '2028-02-29'])
    expect(s.blocks.variable.actualTotalCents).toBe(200)
    expect(s.blocks.bill.actualTotalCents).toBe(160_000)
  })
})

describe('monthSheet monthly amounts (suite)', () => {
  const typed = (categoryId: string, month: string, plannedCents: number | null, dueDay: number | null) => ({
    categoryId,
    effectiveMonth: isoDate(`${month}-01`),
    plannedCents,
    dueDay,
  })
  const categories = [...CATEGORIES, cat('netflix', 'subscription', 1)]
  const month = (asOf: string, planHistory: ReturnType<typeof typed>[], entries: PeriodEntry[] = []) =>
    monthSheet({ categories, budgetHistory: [], statementPeriodEnds: [], startingBalanceCents: null, asOf: isoDate(asOf), planHistory, entries })

  it("counts Netflix's $17.99 once when the card charges $17.99, and planned in a month it does not (decision 3)", () => {
    const history = [typed('netflix', '2026-01', 1_799, 23)]
    const september = month('2026-09-30', history, [row('2026-09-23', -1_799, 'netflix')])
    expect(actuals(september, 'subscription')).toEqual([
      ['music', 0, 'none'],
      ['netflix', 1_799, 'real'],
    ])
    // 17.99, not 35.98: nothing else is spent, so Spent is the one charge (F7).
    expect(september.summary.spentCents).toBe(1_799)
    expect(actuals(month('2026-10-01', history, [row('2026-09-23', -1_799, 'netflix')]), 'subscription')[1]).toEqual([
      'netflix',
      1_799,
      'planned',
    ])
  })

  it('leaves September at the old rent when it is raised from October, and never reaches back (D13)', () => {
    const history = [typed('rent', '2026-10', 170_000, 1), typed('rent', '2026-01', 160_000, 1)]
    const rent = (asOf: string) => actuals(month(asOf, history), 'bill')[0]
    expect(['2025-12-31', '2026-09-30', '2026-10-01', '2027-06-15'].map(rent)).toEqual([
      ['rent', 0, 'none'],
      ['rent', 160_000, 'planned'],
      ['rent', 170_000, 'planned'],
      ['rent', 170_000, 'planned'],
    ])
  })

  it('counts a bill due on the 31st in February, and in the week holding its last day (D6, F8)', () => {
    const history = [typed('rent', '2026-01', 160_000, 31)]
    expect(actuals(month('2026-02-14', history), 'bill')[0]).toEqual(['rent', 160_000, 'planned'])
    const week = (from: string, to: string) =>
      owed([...resolvePlans({ asOf: isoDate(from), history }).plans], [], from, to).blocks.bill.rows[0]!.basis
    // A week that ends on Feb 28 (Monday to Sunday, 2027), carried from the
    // amount typed in 2026: a 31st left unclamped sorts after the week's end
    // and is missed. One that runs into March would not show it.
    expect(week('2027-02-22', '2027-02-28')).toBe('planned')
    expect(week('2027-02-15', '2027-02-21')).toBe('none')
  })

  it('shows a future month its planned bills, and a stopped one none (F10)', () => {
    const history = [typed('loan', '2026-09', 25_000, 20), typed('phone', '2026-09', 6_000, null), typed('phone', '2027-01', null, null)]
    expect(actuals(month('2031-05-01', history), 'debt')).toEqual([['loan', 25_000, 'planned']])
    expect(actuals(month('2031-05-01', history), 'bill')).toEqual([
      ['rent', 0, 'none'],
      ['phone', 0, 'none'],
    ])
  })

  it('counts an amount on a category moved off the recurring lists nowhere, and refuses one it was not given', () => {
    // Fuel was a bill until its amount stopped in August (0009 allows the move then).
    const history = [typed('fuel', '2026-01', 5_000, 3), typed('fuel', '2026-08', null, 3)]
    const march = month('2026-03-01', history)
    expect(march.blocks.variable.rows.map((r) => [r.categoryId, r.actualCents, r.basis])[0]).toEqual(['fuel', 0, 'none'])
    expect(march.summary.spentCents).toBe(0)
    expect(() => month('2026-03-01', [typed('gone', '2026-01', 100, 1)])).toThrow(/category gone/)
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

  it('with no budgets at all, is minus the Variable spend, as the workbook shows a tab left blank', () => {
    expect(summary([]).leftToSpendCents).toBe(-13_000)
  })

  it('is zero, not minus zero, for an empty window', () => {
    const empty = periodSheet(BASE).summary
    expect(Object.is(empty.spentCents, 0)).toBe(true)
    expect(Object.is(empty.leftToSpendCents, 0)).toBe(true)
  })
})

describe('periodSheet ending balance (suite)', () => {
  // Hand-derived, several rows per list. In: pay 2,500.00 + 500.00, bonus
  // 120.00 = 3,120.00. Saved: fund 300.00 in and 50.00 back out, trip 80.00 =
  // 330.00. Spent: food 45.00 + rent planned 1,200.00 = 1,245.00. The 500.00
  // card payment is in none of it. From 1,000.00: 1,000 + 3,120 − 1,245 − 330
  // = 2,545.00 (F7).
  const from = (startingBalanceCents: number | null) =>
    periodSheet({
      ...BASE,
      categories: [...CATEGORIES, cat('trip', 'savings', 1), cat('bonus', 'income', 1)],
      plans: [{ categoryId: 'rent', plannedCents: 120_000, dueDay: 1 }],
      entries: [
        row('2026-09-15', 250_000, 'pay'),
        row('2026-09-30', 50_000, 'pay'),
        row('2026-09-20', 12_000, 'bonus'),
        row('2026-09-16', -30_000, 'fund'),
        row('2026-09-25', 5_000, 'fund'),
        row('2026-09-17', -8_000, 'trip'),
        row('2026-09-03', -4_500, 'food'),
        row('2026-09-18', 50_000, 'card'),
      ],
      startingBalanceCents,
    }).summary

  it('adds every income row and takes off every saving and everything spent', () => {
    expect(from(100_000)).toEqual({
      startingBalanceCents: 100_000,
      spentCents: 124_500,
      leftToSpendCents: -4_500,
      incomeCents: 312_000,
      savedCents: 33_000,
      endingBalanceCents: 254_500,
    })
  })

  it('counts from a typed $0 or an overdrawn start, and gives none with no start typed (D17)', () => {
    expect(from(0).endingBalanceCents).toBe(154_500)
    expect(from(-20_000).endingBalanceCents).toBe(134_500)
    expect(from(null)).toMatchObject({ startingBalanceCents: null, endingBalanceCents: null, spentCents: 124_500 })
  })

  it('refuses a start that is not whole cents, and ends an empty window at zero, not minus zero', () => {
    expect(() => periodSheet({ ...BASE, startingBalanceCents: 10.5 })).toThrow(RangeError)
    expect(Object.is(periodSheet({ ...BASE, startingBalanceCents: 0 }).summary.endingBalanceCents, 0)).toBe(true)
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

  it("gives each spending row Budget − Actual, and a bill with no budget its plan's (F5, F16, F51)", () => {
    expect(columns('variable')).toEqual([
      ['fuel', null, 6_000, -6_000, null],
      ['food', 10_000, 7_000, 3_000, null],
    ])
    expect(columns('bill')).toEqual([
      ['rent', 115_000, 120_000, -5_000, null],
      // No budget typed: its 50.00 plan, due on the 12th, stands as its budget (F51).
      ['phone', null, 4_000, 1_000, null],
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
    // V21 = T21 − U21 and V9 = U9 − T9 once each blank reads as the workbook reads it.
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

describe('periodSheet effective budgets: a plan stands where no budget is typed (suite, F51)', () => {
  const PLANS = [plan('rent', 160_000, 1), plan('phone', 6_000, 12), plan('loan', 25_000, 20), plan('music', 1_199, 12)]
  const columns = (s: ReturnType<typeof periodSheet>, block: keyof ReturnType<typeof periodSheet>['blocks']) =>
    s.blocks[block].rows.map((r) => [r.categoryId, r.budgetCents, r.effectiveBudgetCents, r.budgetBasis, r.actualCents, r.remainingCents])

  // Hand-derived, September. Rent: none typed, its 1,600.00 plan stands and
  // is its Actual: left 0. Phone: 70.00 typed wins over its 60.00 plan, 55.00
  // paid, 15.00 left. Loan: $0 typed wins, 250.00 paid, −250.00. Music: its
  // 11.99 plan, left 0. Bills: 1,655.00 of 1,670.00 effective, 70.00 typed.
  const month = periodSheet({
    ...BASE,
    plans: PLANS,
    budgets: [
      { categoryId: 'phone', budgetCents: 7_000 },
      { categoryId: 'loan', budgetCents: 0 },
      { categoryId: 'food', budgetCents: 10_000 },
    ],
    entries: [row('2026-09-05', -5_500, 'phone'), row('2026-09-20', -25_000, 'loan'), row('2026-09-03', -3_000, 'food')],
  })

  it('takes a planned amount as the budget of a bill, debt or subscription with none typed, and a typed one, $0 too, over it', () => {
    expect(columns(month, 'bill')).toEqual([
      ['rent', null, 160_000, 'planned', 160_000, 0],
      ['phone', 7_000, 7_000, 'typed', 5_500, 1_500],
    ])
    expect(columns(month, 'debt')).toEqual([['loan', 0, 0, 'typed', 25_000, -25_000]])
    expect(columns(month, 'subscription')).toEqual([['music', null, 1_199, 'planned', 1_199, 0]])
  })

  it('totals the effective budgets beside the typed ones, which stay as the workbook has them', () => {
    const { bill, debt, subscription, variable } = month.blocks
    expect([bill, debt, subscription].map((b) => [b.budgetTotalCents, b.effectiveBudgetTotalCents, b.actualTotalCents])).toEqual([
      [7_000, 167_000, 165_500],
      [0, 0, 25_000],
      [0, 1_199, 1_199],
    ])
    // Variable, Income and Savings are as typed; Left to spend is Variable's alone (F5).
    expect(columns(month, 'variable')).toEqual([
      ['fuel', null, null, 'none', 0, 0],
      ['food', 10_000, 10_000, 'typed', 3_000, 7_000],
    ])
    expect(variable.effectiveBudgetTotalCents).toBe(10_000)
    expect(month.summary.leftToSpendCents).toBe(7_000)
    expect(month.blocks.income.rows[0]).toMatchObject({ effectiveBudgetCents: null, budgetBasis: 'none' })
  })

  it('lets a plan stand past a typed "no budget", and gives none for a stopped plan or no plan', () => {
    const s = periodSheet({
      ...BASE,
      categories: [...CATEGORIES, cat('water', 'bill', 2)],
      plans: [plan('rent', 160_000, 1), plan('phone', null, 12)],
      budgets: [{ categoryId: 'rent', budgetCents: null }],
      entries: [row('2026-09-12', -4_000, 'phone'), row('2026-09-14', -3_000, 'water')],
    })
    expect(columns(s, 'bill')).toEqual([
      ['rent', null, 160_000, 'planned', 160_000, 0],
      ['phone', null, null, 'none', 4_000, null],
      ['water', null, null, 'none', 3_000, null],
    ])
    expect(s.blocks.bill.effectiveBudgetTotalCents).toBe(160_000)
  })

  it('counts a plan as the budget in a partial window only where F8 counts it, real rows or not', () => {
    // 7–13 September: only Music is due (the 12th). Rent is due on the 1st,
    // so its payment this week stands against no budget.
    const s = owed(PLANS, [row('2026-09-08', -160_000, 'rent'), row('2026-09-12', -1_000, 'music')], '2026-09-07', '2026-09-13')
    expect(columns(s, 'bill')).toEqual([
      ['rent', null, null, 'none', 160_000, null],
      ['phone', null, 6_000, 'planned', 6_000, 0],
    ])
    expect(columns(s, 'subscription')).toEqual([['music', null, 1_199, 'planned', 1_000, 199]])
    expect(columns(s, 'debt')).toEqual([['loan', null, null, 'none', 0, null]])
  })
})

describe('weekSheet (suite)', () => {
  const weekly = (c: PeriodCategory, weeklyBudgetCents: number | null) => ({ ...c, weeklyBudgetCents })
  const categories = CATEGORIES.map((c) =>
    weekly(c, { food: 10_000, pay: 50_000, fund: 20_000, loan: 0 }[c.id] ?? null),
  )
  const typed = (categoryId: string, month: string, plannedCents: number, dueDay: number) => ({
    categoryId,
    effectiveMonth: isoDate(`${month}-01`),
    plannedCents,
    dueDay,
  })
  const week = (asOf: string, entries: PeriodEntry[], planHistory: ReturnType<typeof typed>[] = []) =>
    weekSheet({ asOf: isoDate(asOf), categories, entries, planHistory, statementPeriodEnds: [], startingBalanceCents: null })

  it('runs Monday to Sunday around asOf and counts the days left, today included (D14)', () => {
    // Thursday 2026-09-24: Thursday to Sunday is four days.
    const s = week('2026-09-24', [row('2026-09-20', -100, 'food'), row('2026-09-21', -200, 'food'), row('2026-09-28', -400, 'food')])
    expect([s.from, s.to, s.daysLeft]).toEqual(['2026-09-21', '2026-09-27', 4])
    expect(s.blocks.variable.actualTotalCents).toBe(200)
    expect(week('2026-09-27', []).daysLeft).toBe(1)
  })

  it('makes each weekly budget its Budgeted or Goal, on every list, and keeps none apart from $0', () => {
    const s = week('2026-09-24', [row('2026-09-22', -3_000, 'food'), row('2026-09-23', 60_000, 'pay'), row('2026-09-23', -5_000, 'fund')])
    expect(s.blocks.variable.rows.find((r) => r.categoryId === 'food')).toMatchObject({ budgetCents: 10_000, remainingCents: 7_000 })
    expect(s.blocks.variable.rows.find((r) => r.categoryId === 'fuel')?.budgetCents).toBeNull()
    expect(s.blocks.debt.rows[0]).toMatchObject({ budgetCents: 0, remainingCents: 0 })
    expect(s.blocks.income).toMatchObject({ budgetTotalCents: 50_000, actualTotalCents: 60_000 })
    // 50.00 saved against a 200.00 goal: 150.00 short (F6).
    expect(s.blocks.savings.rows[0]).toMatchObject({ budgetCents: 20_000, differenceCents: -15_000 })
  })

  it("pays a bill due on the 1st at the new month's amount in a week that starts in the old one (D13, F8)", () => {
    const history = [typed('rent', '2026-01', 160_000, 1), typed('rent', '2026-02', 170_000, 1), typed('loan', '2026-01', 25_000, 20)]
    // Monday 26 January to Sunday 1 February 2026.
    const s = week('2026-01-28', [], history)
    expect(s.blocks.bill.rows[0]).toMatchObject({ categoryId: 'rent', actualCents: 170_000, basis: 'planned' })
    expect(s.blocks.debt.rows[0]).toMatchObject({ actualCents: 0, basis: 'none' })
    expect(week('2026-01-21', [], history).blocks.debt.rows[0]).toMatchObject({ actualCents: 25_000, basis: 'planned' })
    expect(() => week('2026-01-28', [], [typed('gone', '2026-01', 100, 1)])).toThrow(/category gone/)
  })

  it("takes a bill's amount due in the week as its budget, and a typed weekly $0 over it (F51)", () => {
    const history = [typed('rent', '2026-01', 160_000, 1), typed('rent', '2026-02', 170_000, 1), typed('loan', '2026-01', 25_000, 20)]
    // 26 January to 1 February: February's rent is due; the loan's weekly $0 is typed but its 20th is not in the week.
    const s = week('2026-01-28', [], history)
    expect(s.blocks.bill.rows[0]).toMatchObject({ effectiveBudgetCents: 170_000, budgetBasis: 'planned', remainingCents: 0 })
    expect(s.blocks.bill).toMatchObject({ budgetTotalCents: 0, effectiveBudgetTotalCents: 170_000 })
    // 19 to 25 January: the loan is due, and its typed $0 wins.
    const loan = week('2026-01-21', [], history).blocks.debt.rows[0]
    expect(loan).toMatchObject({ effectiveBudgetCents: 0, budgetBasis: 'typed', actualCents: 25_000, remainingCents: -25_000 })
  })
})
