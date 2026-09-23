import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { billCalendar, type BillCalendar } from '../src/bill-calendar.js'
import { monthSheet, type PeriodCategory } from '../src/period-sheet.js'
import type { PlanHistoryRow } from '../src/plans.js'

/**
 * Suite, not External: the workbook caches one month, January 2025, which
 * workbook-bill-calendar replays. The other shapes of month, and every rule
 * Workbook's January does not exercise, are worked by hand below from F20.
 */

/** A month with nothing in it, but its grid. */
const bare = (month: string) => billCalendar({ month: isoDate(month), categories: [], planHistory: [], entries: [] })

/** Each week as its seven day numbers, 0 for a blank place. */
const grid = (calendar: BillCalendar) => calendar.weeks.map((w) => w.days.map((d) => (d === null ? 0 : d.day)))

describe('billCalendar, the grid', () => {
  it('starts a month whose 1st is a Sunday in the first place, and needs only four weeks for a 28-day one', () => {
    // 1 February 2026 is a Sunday: Workbook's B9 typo (D19) would have hidden its rent.
    expect(grid(bare('2026-02-14'))).toEqual([
      [1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14],
      [15, 16, 17, 18, 19, 20, 21],
      [22, 23, 24, 25, 26, 27, 28],
    ])
  })

  it('runs to six weeks when a 31-day month starts on a Saturday', () => {
    const weeks = grid(bare('2026-08-01'))
    expect(weeks).toHaveLength(6)
    expect(weeks[0]).toEqual([0, 0, 0, 0, 0, 0, 1])
    expect(weeks[5]).toEqual([30, 31, 0, 0, 0, 0, 0])
  })

  it('names the month by its first day, and each day by its date', () => {
    const calendar = bare('2024-02-29')
    expect(calendar.month).toBe('2024-02-01')
    // 29 February 2024 is a Thursday, the leap day, in the fifth week.
    expect(calendar.weeks[4]?.days[4]).toEqual({ date: '2024-02-29', day: 29, bills: [] })
    expect(calendar.weeks[4]?.days[5]).toBeNull()
  })
})

// A synthetic household: rent from the bank, a card-paid streaming service,
// a car loan, and a gym that has no day paid yet.
const categories: PeriodCategory[] = [
  { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 0 },
  { id: 'power', name: 'Power', kind: 'bill', sortOrder: 1 },
  { id: 'gym', name: 'Gym', kind: 'bill', sortOrder: 2 },
  { id: 'loan', name: 'Car loan', kind: 'debt', sortOrder: 0 },
  { id: 'stream', name: 'Streamly', kind: 'subscription', sortOrder: 0 },
  { id: 'food', name: 'Groceries', kind: 'variable', sortOrder: 0 },
  { id: 'card', name: 'Card payments', kind: 'transfer', sortOrder: 0 },
]
const plan = (categoryId: string, plannedCents: number | null, dueDay: number | null, effectiveMonth = '2026-01-01'): PlanHistoryRow => ({
  categoryId, effectiveMonth: isoDate(effectiveMonth), plannedCents, dueDay,
})
const entry = (postedOn: string, amountCents: number, categoryId: string) => ({ postedOn: isoDate(postedOn), amountCents, categoryId })
const planHistory = [plan('rent', 160000, 31), plan('power', 9000, 15), plan('gym', 4500, null), plan('loan', 30000, 1), plan('stream', 1799, 9)]

/** What each day holds, as `day: name amount` lines, for the days that hold anything. */
function listed(calendar: BillCalendar): string[] {
  return calendar.weeks.flatMap((w) =>
    w.days.flatMap((d) => (d === null ? [] : d.bills.map((b) => `${d.day}: ${b.name} ${b.amountCents} ${b.basis}`))),
  )
}

describe('billCalendar, what is due', () => {
  it('shows a real charge on its own date and drops that month’s monthly amount (D5), and keeps a refund’s minus sign', () => {
    const calendar = billCalendar({
      month: isoDate('2026-04-01'),
      categories,
      planHistory,
      // Streamly charged on the 11th, not its day paid, then refunded in part;
      // groceries and a card payment are on no day.
      entries: [entry('2026-04-11', -1799, 'stream'), entry('2026-04-20', 500, 'stream'), entry('2026-04-11', -6000, 'food'), entry('2026-04-02', 25000, 'card')],
    })
    expect(listed(calendar)).toEqual([
      '1: Car loan 30000 planned',
      '11: Streamly 1799 real',
      '15: Power 9000 planned',
      '20: Streamly -500 real',
      // Rent due on the 31st, in a 30-day April (D21).
      '30: Rent 160000 planned',
    ])
    expect(calendar.weeks.map((w) => w.totalCents)).toEqual([30000, 1799, 9000, -500, 160000])
    expect(calendar.totalCents).toBe(200299)
  })

  it('lists a monthly amount with no day paid apart, in no total, as a blank Bills!B7 is on no day', () => {
    const calendar = billCalendar({ month: isoDate('2026-04-01'), categories, planHistory, entries: [] })
    expect(calendar.undated.map((b) => `${b.name} ${b.amountCents}`)).toEqual(['Gym 4500'])
    expect(calendar.totalCents).toBe(30000 + 1799 + 9000 + 160000)
  })

  it('adds up to the Month’s Bills, Debts and Subscriptions when every amount has a day paid', () => {
    const dated = planHistory.filter((p) => p.dueDay !== null)
    const entries = [entry('2026-02-11', -1799, 'stream'), entry('2026-02-27', -30500, 'loan')]
    const calendar = billCalendar({ month: isoDate('2026-02-01'), categories, planHistory: dated, entries })
    const month = monthSheet({
      asOf: isoDate('2026-02-01'), categories, budgetHistory: [], planHistory: dated, entries, statementPeriodEnds: [], startingBalanceCents: null,
    })
    const { bill, debt, subscription } = month.blocks
    expect(calendar.totalCents).toBe(bill.actualTotalCents + debt.actualTotalCents + subscription.actualTotalCents)
    // Rent on the 31st lands on the 28th of February (D21).
    expect(listed(calendar)).toContain('28: Rent 160000 planned')
  })

  it('holds every bill on a day, in list order, not Workbook’s five (D20)', () => {
    const many = Array.from({ length: 7 }, (_, i): PeriodCategory => ({ id: `b${i}`, name: `Bill ${i}`, kind: i < 3 ? 'subscription' : 'bill', sortOrder: 6 - i }))
    const calendar = billCalendar({ month: isoDate('2026-03-01'), categories: many, planHistory: many.map((c) => plan(c.id, 100, 1)), entries: [] })
    expect(calendar.weeks[0]?.days[0]?.bills.map((b) => b.name)).toEqual(['Bill 6', 'Bill 5', 'Bill 4', 'Bill 3', 'Bill 2', 'Bill 1', 'Bill 0'])
    // 1 March 2026 is a Sunday, the day Workbook's B9 typo emptied (D19).
    expect(calendar.weeks[0]?.totalCents).toBe(700)
  })

  it('uses the amount in effect that month (D13), shows none once stopped, and none on a category moved off the bill lists', () => {
    const history = [plan('rent', 160000, 1), plan('rent', 170000, 1, '2026-06-01'), plan('power', 9000, 15), plan('power', null, 15, '2026-06-01'), plan('food', 100, 3)]
    expect(listed(billCalendar({ month: isoDate('2026-05-01'), categories, planHistory: history, entries: [] }))).toEqual(['1: Rent 160000 planned', '15: Power 9000 planned'])
    expect(listed(billCalendar({ month: isoDate('2026-06-01'), categories, planHistory: history, entries: [] }))).toEqual(['1: Rent 170000 planned'])
  })

  it('refuses a charge or an amount naming a category it was not given, rather than leave it off every day', () => {
    const ask = (planHistory: PlanHistoryRow[], entries: ReturnType<typeof entry>[]) => () =>
      billCalendar({ month: isoDate('2026-04-01'), categories, planHistory, entries })
    expect(ask([plan('gone', 100, 1)], [])).toThrow(/category gone/)
    expect(ask([], [entry('2025-01-01', -100, 'gone')])).toThrow(/category gone/)
  })
})
