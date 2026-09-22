import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { weekBounds, weeklySummary, type LedgerEntry } from '../src/week.js'

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

  it('crosses a month and a year boundary', () => {
    // 2027-01-01 is a Friday.
    expect(weekBounds(isoDate('2027-01-01'))).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })
})

const FOOD = { id: 'food', name: 'Food', weeklyBudgetCents: 10_000 }
const FUEL = { id: 'fuel', name: 'Fuel', weeklyBudgetCents: 6_000 }
const FUN = { id: 'fun', name: 'Fun', weeklyBudgetCents: null }

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
  entry('2026-09-26', -1_800, null), // not yet categorised
  entry('2026-09-26', 50_000, null), // a card payment: money in, not spending
  entry('2026-09-20', -9_999, 'food'), // the Sunday BEFORE: another week
  entry('2026-09-28', -9_999, 'food'), // the Monday AFTER: another week
]

describe('weeklySummary', () => {
  const week = weeklySummary({
    entries: ENTRIES,
    categories: [FOOD, FUEL, FUN],
    asOf: isoDate('2026-09-24'),
  })

  it('counts only the rows inside the week', () => {
    expect(week.start).toBe('2026-09-21')
    expect(week.end).toBe('2026-09-27')
    expect(week.entryCount).toBe(7)
  })

  it('reports spending net of refunds, and money in separately', () => {
    // 6,500 food + 7,200 fuel + 2,500 fun + 1,800 uncategorised
    expect(week.spentCents).toBe(18_000)
    expect(week.inflowCents).toBe(50_000)
  })

  it('compares each category against its own budget', () => {
    const food = week.categories.find((c) => c.categoryId === 'food')
    expect(food).toMatchObject({ spentCents: 6_500, budgetCents: 10_000, remainingCents: 3_500, over: false })
    expect(food?.usedBasisPoints).toBe(6_500)

    const fuel = week.categories.find((c) => c.categoryId === 'fuel')
    expect(fuel).toMatchObject({ spentCents: 7_200, budgetCents: 6_000, remainingCents: -1_200, over: true })
  })

  it('has no remaining figure for a category with no budget, rather than a zero', () => {
    // Zero would read as "used it all". There is no limit, so there is no
    // remainder to report.
    const fun = week.categories.find((c) => c.categoryId === 'fun')
    expect(fun).toMatchObject({ spentCents: 2_500, budgetCents: null, remainingCents: null, over: false })
    expect(fun?.usedBasisPoints).toBeNull()
  })

  it('totals the budget only across categories that have one', () => {
    expect(week.budgetCents).toBe(16_000)
    // Budgeted categories only: 16,000 − (6,500 + 7,200). Unbudgeted spending
    // is reported, but it cannot eat into a limit that was never set.
    expect(week.remainingCents).toBe(2_300)
  })

  it('keeps uncategorised spending visible instead of dropping it', () => {
    expect(week.uncategorisedSpentCents).toBe(1_800)
  })

  it('orders categories by spending, largest first', () => {
    expect(week.categories.map((c) => c.categoryId)).toEqual(['fuel', 'food', 'fun'])
  })

  it('counts the days left, including today', () => {
    // Thursday: Thu, Fri, Sat, Sun.
    expect(week.daysLeft).toBe(4)
  })
})

describe('weeklySummary edge cases', () => {
  it('returns a null remainder when no category has a budget', () => {
    const week = weeklySummary({ entries: [], categories: [FUN], asOf: isoDate('2026-09-24') })
    expect(week.budgetCents).toBeNull()
    expect(week.remainingCents).toBeNull()
    expect(week.spentCents).toBe(0)
  })

  it('lists a budgeted category with no spending, so its full budget shows', () => {
    const week = weeklySummary({ entries: [], categories: [FOOD], asOf: isoDate('2026-09-24') })
    expect(week.categories).toEqual([
      expect.objectContaining({ categoryId: 'food', spentCents: 0, remainingCents: 10_000 }),
    ])
  })

  it('refuses a fractional amount rather than summing a float', () => {
    expect(() =>
      weeklySummary({
        entries: [entry('2026-09-24', -12.5, 'food')],
        categories: [FOOD],
        asOf: isoDate('2026-09-24'),
      }),
    ).toThrow(RangeError)
  })
})
