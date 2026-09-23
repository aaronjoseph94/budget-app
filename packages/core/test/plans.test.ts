import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { billsTotals, resolvePlans, type BillsCategory, type PlanHistoryRow } from '../src/plans.js'

/**
 * Suite tests, worked by hand. Workbook has one Monthly Amount for every month
 * (Bills!D7:D29, H7:H29, L7:L29), so no cached cell shows an amount changing,
 * stopping or starting again; those are the app's (D13), and are checked here.
 */

const typed = (categoryId: string, month: string, plannedCents: number | null, dueDay: number | null): PlanHistoryRow => ({
  categoryId,
  effectiveMonth: isoDate(`${month}-01`),
  plannedCents,
  dueDay,
})
/** Each category's amount and day in `month`, read on its 20th; a category with nothing in effect is absent. */
const at = (month: string, history: PlanHistoryRow[]) =>
  resolvePlans({ asOf: isoDate(`${month}-20`), history }).plans.map((p) => [p.categoryId, p.plannedCents, p.dueDay])
const rentIn = (months: string[], history: PlanHistoryRow[]) =>
  months.map((m) => at(m, history).find(([id]) => id === 'rent')?.[1])

describe('resolvePlans (suite)', () => {
  it('applies the latest amount set at or before a month, and never reaches back', () => {
    const history = [typed('rent', '2026-01', 160_000, 1), typed('rent', '2026-10', 170_000, 1)]
    // Dec 2025: nothing set yet. Jan to Sep: 1,600. October's rise leaves September alone (D13).
    const months = ['2025-12', '2026-01', '2026-09', '2026-10', '2027-03']
    const expected = [undefined, 160_000, 160_000, 170_000, 170_000]
    expect(rentIn(months, history)).toEqual(expected)
    // The database promises no order; "latest" is by month, not by position.
    expect(rentIn(months, [...history].reverse())).toEqual(expected)
  })

  it('keeps a stopped amount as stopped, with its day, until a later month sets one again', () => {
    const history = [typed('gym', '2026-01', 5_000, 5), typed('gym', '2026-04', null, 5), typed('gym', '2026-07', 6_000, 5)]
    // Null is present, not absent: "stopped from April" says so.
    expect(at('2026-04', history)).toEqual([['gym', null, 5]])
    expect(at('2026-06', history)).toEqual([['gym', null, 5]])
    expect(at('2026-03', history)).toEqual([['gym', 5_000, 5]])
    expect(at('2026-07', history)).toEqual([['gym', 6_000, 5]])
  })

  it('takes the day paid from the row in effect, blank included', () => {
    const history = [typed('phone', '2026-01', 8_000, null), typed('phone', '2026-03', 8_000, 12)]
    expect(at('2026-02', history)).toEqual([['phone', 8_000, null]])
    expect(at('2026-03', history)).toEqual([['phone', 8_000, 12]])
  })

  it('resolves each category on its own, a zero amount included', () => {
    const history = [
      typed('rent', '2026-01', 160_000, 1),
      typed('netflix', '2026-05', 0, 23),
      typed('loan', '2026-02', 25_000, 14),
      typed('loan', '2026-03', null, 14),
    ]
    expect(at('2026-01', history)).toEqual([['rent', 160_000, 1]])
    // $0 is an amount (a free month), not a stop.
    expect(at('2026-05', history)).toEqual([
      ['rent', 160_000, 1],
      ['netflix', 0, 23],
      ['loan', null, 14],
    ])
  })

  it('refuses what 0009 refuses', () => {
    const refused = (row: PlanHistoryRow) => () => resolvePlans({ asOf: isoDate('2026-09-01'), history: [row] })
    expect(refused(typed('rent', '2026-09', -1, 1))).toThrow(RangeError)
    expect(refused({ ...typed('rent', '2026-09', 160_000, 1), effectiveMonth: isoDate('2026-09-02') })).toThrow(/first day/)
    expect(refused(typed('rent', '2026-09', 1.5, 1))).toThrow(RangeError)
    for (const day of [0, 32, 1.5]) expect(refused(typed('rent', '2026-09', 160_000, day))).toThrow(/1 to 31/)
    // A later row is checked too, though it could not apply in September.
    expect(refused(typed('rent', '2026-12', -1, 1))).toThrow(RangeError)
    const twice = [typed('rent', '2026-09', 160_000, 1), typed('rent', '2026-09', 170_000, 1)]
    expect(() => resolvePlans({ asOf: isoDate('2026-09-01'), history: twice })).toThrow(/Two monthly amounts/)
  })
})

describe('billsTotals (suite)', () => {
  const lists: BillsCategory[] = [
    { id: 'rent', kind: 'bill' },
    { id: 'phone', kind: 'bill' },
    { id: 'water', kind: 'bill' },
    { id: 'gym', kind: 'bill' },
    { id: 'car-loan', kind: 'debt' },
    { id: 'student-loan', kind: 'debt' },
    { id: 'netflix', kind: 'subscription' },
    { id: 'spotify', kind: 'subscription' },
    { id: 'dropbox', kind: 'subscription' },
    { id: 'groceries', kind: 'variable' },
  ]
  const history = [
    typed('rent', '2026-01', 160_000, 1),
    typed('rent', '2026-10', 170_000, 1),
    typed('phone', '2026-03', 8_500, null),
    typed('water', '2026-01', 4_250, 20),
    typed('gym', '2026-01', 5_000, 5),
    typed('gym', '2026-09', null, 5),
    typed('car-loan', '2026-02', 35_000, 14),
    typed('student-loan', '2026-06', 20_000, 28),
    typed('netflix', '2026-01', 1_799, 23),
    typed('spotify', '2026-01', 1_199, 2),
    typed('dropbox', '2026-11', 1_399, 9),
    // Groceries was a bill until August, when its amount stopped and it moved
    // to Variable expenses; 0009 keeps the history, and it counts nowhere now.
    typed('groceries', '2026-01', 40_000, 3),
    typed('groceries', '2026-08', null, 3),
  ]
  const totalsIn = (month: string, categories = lists) =>
    billsTotals({ month: isoDate(`${month}-15`), categories, planHistory: history })

  it('adds every amount in effect on each list, and all three for the fixed total', () => {
    // September: rent 1,600 + phone 85 + water 42.50 (gym stopped) = 1,727.50;
    // car loan 350 + student loan 200 = 550; Netflix 17.99 + Spotify 11.99 = 29.98.
    expect(totalsIn('2026-09')).toEqual({
      billsCents: 172_750,
      debtsCents: 55_000,
      subscriptionsCents: 2_998,
      allFixedCents: 172_750 + 55_000 + 2_998,
    })
    // November: rent is 1,700 from October, and Dropbox starts.
    expect(totalsIn('2026-11')).toEqual({
      billsCents: 182_750,
      debtsCents: 55_000,
      subscriptionsCents: 4_397,
      allFixedCents: 182_750 + 55_000 + 4_397,
    })
  })

  it('counts only what had started by that month', () => {
    // January: rent, water and gym; no phone until March, no debts until February.
    expect(totalsIn('2026-01')).toEqual({ billsCents: 169_250, debtsCents: 0, subscriptionsCents: 2_998, allFixedCents: 172_248 })
    // Before anything was set, every total is a real $0.
    expect(totalsIn('2025-12')).toEqual({ billsCents: 0, debtsCents: 0, subscriptionsCents: 0, allFixedCents: 0 })
  })

  it("counts a category on the list it is on now, and a past plan on another list nowhere", () => {
    // In March, Groceries' old 400 is in effect, but it is a Variable expense now.
    expect(totalsIn('2026-03').billsCents).toBe(160_000 + 8_500 + 4_250 + 5_000)
    // Moved to Debts, the phone's amount counts there instead.
    const moved = lists.map((c) => (c.id === 'phone' ? { ...c, kind: 'debt' as const } : c))
    expect(totalsIn('2026-09', moved)).toMatchObject({ billsCents: 164_250, debtsCents: 63_500 })
  })

  it('refuses a monthly amount for a category it was not given', () => {
    expect(() => totalsIn('2026-09', lists.filter((c) => c.id !== 'water'))).toThrow(/water/)
  })
})
