import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { monthSheet, weekSheet, type PeriodCategory, type PeriodEntry } from '../src/period-sheet.js'

/**
 * Suite, worked by hand (F54): a bill already charged in its month is not
 * planned again in the week of its due day. The workbook has no such cell:
 * it adds a monthly amount to every logged payment (F3), and the cells where
 * D5 differs are left out of its fixtures.
 *
 * The tester's September 2026: Netflix, $17.99, is due on the 23rd and was
 * charged on the 1st; the phone, $65.00, is due on the 18th and was charged
 * on the 5th. The gym, $40.00, due on the 23rd, was charged nowhere.
 */

const cat = (id: string, kind: PeriodCategory['kind'], sortOrder: number) => ({ id, name: id, kind, sortOrder, weeklyBudgetCents: null })
const CATEGORIES = [cat('phone', 'bill', 0), cat('netflix', 'subscription', 0), cat('gym', 'subscription', 1)]
const row = (postedOn: string, amountCents: number, categoryId: string): PeriodEntry => ({ postedOn: isoDate(postedOn), amountCents, categoryId })
const typed = (categoryId: string, plannedCents: number, dueDay: number) => ({
  categoryId,
  effectiveMonth: isoDate('2026-01-01'),
  plannedCents,
  dueDay,
})
const PLANS = [typed('netflix', 1_799, 23), typed('phone', 6_500, 18), typed('gym', 4_000, 23)]
const SEPTEMBER = [row('2026-09-01', -1_799, 'netflix'), row('2026-09-05', -6_500, 'phone')]
const MONDAYS = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']

const week = (asOf: string, entries: PeriodEntry[] = SEPTEMBER, planHistory = PLANS) =>
  weekSheet({ asOf: isoDate(asOf), categories: CATEGORIES, entries, planHistory, statementPeriodEnds: [], startingBalanceCents: null })
const of = (s: ReturnType<typeof week>, id: string) => {
  const found = [...s.blocks.bill.rows, ...s.blocks.subscription.rows].find((r) => r.categoryId === id)
  if (found === undefined) throw new Error(`no row for ${id}`)
  return found
}

describe('weekSheet, a bill already charged in its month (F54)', () => {
  it('leaves the monthly amount out of the week of its due day once the month has a real charge', () => {
    // 21–27 September holds the 23rd. Netflix was charged on the 1st, so
    // nothing more is due; the gym is still planned.
    const s = week('2026-09-21')
    expect(of(s, 'netflix')).toMatchObject({ actualCents: 0, basis: 'none', effectiveBudgetCents: null, budgetBasis: 'none' })
    expect(of(s, 'gym')).toMatchObject({ actualCents: 4_000, basis: 'planned', effectiveBudgetCents: 4_000 })
    expect(s.summary.spentCents).toBe(4_000)
    // 14–20 September holds the 18th; the phone was charged on the 5th.
    expect(of(week('2026-09-14'), 'phone')).toMatchObject({ actualCents: 0, basis: 'none' })
  })

  it("adds up, across September's weeks, to what the Month counts: each bill once", () => {
    const acrossWeeks = (id: string) => MONDAYS.map((monday) => of(week(monday), id).actualCents)
    expect(acrossWeeks('netflix')).toEqual([1_799, 0, 0, 0, 0])
    expect(acrossWeeks('phone')).toEqual([6_500, 0, 0, 0, 0])
    expect(acrossWeeks('gym')).toEqual([0, 0, 0, 4_000, 0])
    const month = monthSheet({
      asOf: isoDate('2026-09-01'),
      categories: CATEGORIES,
      entries: SEPTEMBER,
      planHistory: PLANS,
      budgetHistory: [],
      statementPeriodEnds: [],
      startingBalanceCents: null,
    })
    expect(month.blocks.subscription.rows.map((r) => r.actualCents)).toEqual([1_799, 4_000])
    expect(month.blocks.bill.rows.map((r) => r.actualCents)).toEqual([6_500])
  })

  it('leaves it out when the charge comes later in the month, too', () => {
    // Due on the 23rd, charged on the 29th: the Bill calendar shows the 29th alone.
    const late = [row('2026-09-29', -1_799, 'netflix')]
    expect(of(week('2026-09-21', late), 'netflix')).toMatchObject({ actualCents: 0, basis: 'none' })
    expect(of(week('2026-09-28', late), 'netflix')).toMatchObject({ actualCents: 1_799, basis: 'real' })
  })

  it('keeps the plan as the budget of a charge inside the week (F51)', () => {
    const onTime = week('2026-09-21', [row('2026-09-22', -1_799, 'netflix')])
    expect(of(onTime, 'netflix')).toMatchObject({ actualCents: 1_799, basis: 'real', effectiveBudgetCents: 1_799, remainingCents: 0 })
  })

  it("reads each month's bill by that month's charges alone", () => {
    // August's charge says nothing about September's bill.
    expect(of(week('2026-09-21', [row('2026-08-23', -1_799, 'netflix')]), 'netflix')).toMatchObject({ actualCents: 1_799, basis: 'planned' })
    // 28 September to 4 October, due on the 1st: September's charge on the
    // 2nd leaves October's amount due on 1 October; October's own takes it away.
    const first = [typed('netflix', 1_799, 1)]
    expect(of(week('2026-09-28', [row('2026-09-02', -1_799, 'netflix')], first), 'netflix')).toMatchObject({ actualCents: 1_799, basis: 'planned' })
    const both = [row('2026-09-02', -1_799, 'netflix'), row('2026-10-09', -1_799, 'netflix')]
    expect(of(week('2026-09-28', both, first), 'netflix')).toMatchObject({ actualCents: 0, basis: 'none' })
  })
})
