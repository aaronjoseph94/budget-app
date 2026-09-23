import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { monthBounds, shiftMonth, shiftWeek, weekBounds, weeklySummary, type LedgerEntry } from '../src/week.js'

/**
 * Not workbook-derived: the workbook has no weekly view (docs/ROADMAP.md makes
 * weekly the primary lens as a new capability). Expected values are worked by
 * hand from the invented rows below, so a reader can check each one.
 */

describe('weekBounds', () => {
  it('starts on Monday and ends on Sunday', () => {
    // 2026-09-22 is a Tuesday.
    expect(weekBounds(isoDate('2026-09-22'))).toEqual({ start: '2026-09-21', end: '2026-09-27' })
  })

  it('treats Monday as the first day of its own week', () => {
    expect(weekBounds(isoDate('2026-09-21')).start).toBe('2026-09-21')
  })

  it('treats Sunday as the last day of the week before', () => {
    // A Sunday-first week would put this in a new week and split the weekend.
    expect(weekBounds(isoDate('2026-09-27'))).toEqual({ start: '2026-09-21', end: '2026-09-27' })
  })

  it('steps whole weeks, across a year boundary', () => {
    expect(shiftWeek(isoDate('2026-12-28'), 1)).toBe('2027-01-04')
    expect(shiftWeek(isoDate('2026-09-21'), -1)).toBe('2026-09-14')
  })

  it('crosses a month and a year boundary', () => {
    // 2027-01-01 is a Friday.
    expect(weekBounds(isoDate('2027-01-01'))).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })
})

const FOOD = { id: 'food', name: 'Food', kind: 'variable', weeklyBudgetCents: 10_000 } as const
const FUEL = { id: 'fuel', name: 'Fuel', kind: 'variable', weeklyBudgetCents: 6_000 } as const
const FUN = { id: 'fun', name: 'Fun', kind: 'variable', weeklyBudgetCents: null } as const
const SHOES = { id: 'shoes', name: 'Shoes', kind: 'variable', weeklyBudgetCents: null } as const
const PHONE = { id: 'phone', name: 'Phone', kind: 'bill', weeklyBudgetCents: null } as const
const LOAN = { id: 'loan', name: 'Car loan', kind: 'debt', weeklyBudgetCents: null } as const
const MUSIC = { id: 'music', name: 'Music', kind: 'subscription', weeklyBudgetCents: null } as const
// A weekly budget on a list that is not spending is never summed in.
const PAY = { id: 'pay', name: 'Pay', kind: 'income', weeklyBudgetCents: 5_000 } as const
const FUND = { id: 'fund', name: 'Flight fund', kind: 'savings', weeklyBudgetCents: 2_000 } as const
const CARD = { id: 'card', name: 'Card payments', kind: 'transfer', weeklyBudgetCents: 1_000 } as const
const ALL = [FOOD, FUEL, FUN, SHOES, PHONE, LOAN, MUSIC, PAY, FUND, CARD]

const entry = (postedOn: string, amountCents: number, categoryId: string | null): LedgerEntry => ({
  postedOn: isoDate(postedOn),
  amountCents,
  categoryId,
})

// Week of Mon 2026-09-21 .. Sun 2026-09-27.
const ENTRIES: LedgerEntry[] = [
  entry('2026-09-21', -3_000, 'food'),
  entry('2026-09-23', -4_500, 'food'),
  entry('2026-09-24', 1_000, 'food'), // a refund: food nets to 6,500
  entry('2026-09-22', -7_200, 'fuel'), // over the 6,000 fuel budget
  entry('2026-09-25', -2_500, 'fun'), // no budget set
  entry('2026-09-25', 3_000, 'shoes'), // a return with no purchase this week
  entry('2026-09-22', -4_000, 'phone'),
  entry('2026-09-23', -1_500, 'loan'),
  entry('2026-09-23', -1_100, 'music'),
  entry('2026-09-26', -1_800, null), // not yet categorised
  entry('2026-09-24', 250_000, 'pay'), // money in
  entry('2026-09-24', -20_000, 'fund'), // a move to savings: not spending
  entry('2026-09-26', 50_000, 'card'), // paying the card: neither
  entry('2026-09-20', -9_999, 'food'), // the Sunday BEFORE: another week
  entry('2026-09-28', -9_999, 'food'), // the Monday AFTER: another week
]

describe('weeklySummary', () => {
  const week = weeklySummary({ entries: ENTRIES, categories: ALL, asOf: isoDate('2026-09-24') })

  it('counts only the rows inside the week', () => {
    expect(week.start).toBe('2026-09-21')
    expect(week.end).toBe('2026-09-27')
    expect(week.entryCount).toBe(13)
  })

  it('counts bills, debts, subscriptions and variable expenses as spending, net and signed', () => {
    // 6,500 food + 7,200 fuel + 2,500 fun − 3,000 shoes + 4,000 phone
    // + 1,500 loan + 1,100 music + 1,800 uncategorised
    expect(week.spentCents).toBe(21_600)
  })

  it('counts only the Income list as money in', () => {
    expect(week.inflowCents).toBe(250_000)
  })

  it('leaves out savings and card payments, and reports the card payment on its own', () => {
    expect(week.transfersCents).toBe(50_000)
    const ids = week.categories.map((c) => c.categoryId)
    expect(ids).not.toContain('fund')
    expect(ids).not.toContain('card')
    expect(ids).not.toContain('pay')
  })

  it('compares each category against its own budget', () => {
    const food = week.categories.find((c) => c.categoryId === 'food')
    expect(food).toMatchObject({ spentCents: 6_500, budgetCents: 10_000, remainingCents: 3_500, over: false })
    expect(food?.usedBasisPoints).toBe(6_500)

    const fuel = week.categories.find((c) => c.categoryId === 'fuel')
    expect(fuel).toMatchObject({ spentCents: 7_200, budgetCents: 6_000, remainingCents: -1_200, over: true })
  })

  it('shows a return with no purchase as negative spending, not as money in', () => {
    const shoes = week.categories.find((c) => c.categoryId === 'shoes')
    expect(shoes).toMatchObject({ spentCents: -3_000, budgetCents: null, remainingCents: null, over: false })
  })

  it('has no remaining figure for a category with no budget, rather than a zero', () => {
    // Zero would read as "used it all". There is no limit, so there is no
    // remainder to report.
    const fun = week.categories.find((c) => c.categoryId === 'fun')
    expect(fun).toMatchObject({ spentCents: 2_500, budgetCents: null, remainingCents: null, over: false })
    expect(fun?.usedBasisPoints).toBeNull()
  })

  it('totals the budget over spending lists only', () => {
    // 10,000 food + 6,000 fuel. Pay's 5,000, the fund's 2,000 and the card's
    // 1,000 are on lists that are not spending, so they are not limits on it.
    expect(week.budgetCents).toBe(16_000)
    // Budgeted categories only: 16,000 − (6,500 + 7,200). Unbudgeted spending
    // is reported, but it cannot eat into a limit that was never set.
    expect(week.remainingCents).toBe(2_300)
  })

  it('reports the share of the whole budget used', () => {
    // (6,500 + 7,200) / 16,000 = 85.625% -> 8,562 bp, floored.
    expect(week.usedBasisPoints).toBe(8_562)
  })

  it('keeps uncategorised spending visible instead of dropping it', () => {
    expect(week.uncategorisedSpentCents).toBe(1_800)
  })

  it('orders categories by spending, largest first, a return last', () => {
    expect(week.categories.map((c) => c.categoryId)).toEqual(['fuel', 'food', 'phone', 'fun', 'loan', 'music', 'shoes'])
  })

  it('counts the days left, including today', () => {
    // Thursday: Thu, Fri, Sat, Sun.
    expect(week.daysLeft).toBe(4)
  })
})

describe('weeklySummary edge cases', () => {
  const asOf = isoDate('2026-09-24')

  it('returns a null remainder when no category has a budget', () => {
    const week = weeklySummary({ entries: [], categories: [FUN], asOf })
    expect(week.budgetCents).toBeNull()
    expect(week.remainingCents).toBeNull()
    expect(week.spentCents).toBe(0)
  })

  it('has no budget at all when only lists that are not spending have one', () => {
    const week = weeklySummary({ entries: [], categories: [PAY, FUND, CARD], asOf })
    expect(week.budgetCents).toBeNull()
    expect(week.categories).toEqual([])
  })

  it('lists a budgeted category with no spending, so its full budget shows', () => {
    const week = weeklySummary({ entries: [], categories: [FOOD], asOf })
    expect(week.categories).toEqual([
      expect.objectContaining({ categoryId: 'food', spentCents: 0, remainingCents: 10_000 }),
    ])
  })

  // The week's total is negative rather than vanishing to zero, and money in
  // stays zero: a refund is not pay.
  it('shows a refund-only week as negative spending', () => {
    const week = weeklySummary({ entries: [entry('2026-09-22', 1_000, 'food')], categories: [FOOD], asOf })
    expect(week.spentCents).toBe(-1_000)
    expect(week.inflowCents).toBe(0)
    expect(week.categories).toEqual([
      expect.objectContaining({ categoryId: 'food', spentCents: -1_000, remainingCents: 11_000, usedBasisPoints: -1_000, over: false }),
    ])
    expect(week.remainingCents).toBe(11_000)
  })

  it('nets a purchase and its full return to a zero row, still listed', () => {
    const week = weeklySummary({
      entries: [entry('2026-09-22', -2_000, 'shoes'), entry('2026-09-23', 2_000, 'shoes')],
      categories: [SHOES],
      asOf,
    })
    expect(week.categories).toEqual([expect.objectContaining({ categoryId: 'shoes', spentCents: 0 })])
  })

  it('nets money in within the Income list, and money moved in the other direction', () => {
    const week = weeklySummary({
      entries: [entry('2026-09-22', 100_000, 'pay'), entry('2026-09-23', -4_000, 'pay'), entry('2026-09-23', -5_000, 'card')],
      categories: [PAY, CARD],
      asOf,
    })
    expect(week.inflowCents).toBe(96_000)
    expect(week.transfersCents).toBe(-5_000)
    expect(week.spentCents).toBe(0)
  })

  // With no list, nothing says whether money came in or went out for good.
  // Outflows stay visible as uncategorised spending; an inflow is reported
  // on its own, never as money in and never netted against spending.
  it('treats a row whose category is unknown as uncategorised', () => {
    const week = weeklySummary({
      entries: [entry('2026-09-22', -900, 'gone'), entry('2026-09-22', 700, 'gone'), entry('2026-09-23', 500, null)],
      categories: [FOOD],
      asOf,
    })
    expect(week.uncategorisedSpentCents).toBe(900)
    expect(week.uncategorisedInCents).toBe(1_200)
    expect(week.spentCents).toBe(900)
    expect(week.inflowCents).toBe(0)
  })

  it('refuses a fractional amount rather than summing a float', () => {
    expect(() =>
      weeklySummary({ entries: [entry('2026-09-24', -12.5, 'food')], categories: [FOOD], asOf }),
    ).toThrow(RangeError)
  })
})

describe('monthBounds', () => {
  it('spans the first to the last day', () => {
    expect(monthBounds(isoDate('2026-09-22'))).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })

  it('knows February in a leap year and out of one', () => {
    expect(monthBounds(isoDate('2028-02-10')).end).toBe('2028-02-29')
    expect(monthBounds(isoDate('2027-02-10')).end).toBe('2027-02-28')
  })

  it('steps whole months from the first, never skipping a short one', () => {
    // From the 31st, "one month on" lands in March and skips February; the
    // ledger steps from the 1st so every month is visited.
    expect(shiftMonth(isoDate('2026-01-31'), 1)).toBe('2026-02-01')
    expect(shiftMonth(isoDate('2026-01-15'), -1)).toBe('2025-12-01')
  })
})
