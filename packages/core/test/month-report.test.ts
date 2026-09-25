import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { monthReport, type MonthReportInput } from '../src/index.js'

/** Suite tests, worked by hand from F36 (docs/formula-decisions.md). */

const d = isoDate
const row = (postedOn: string, amountCents: number, categoryId: string) => ({ postedOn: d(postedOn), amountCents, categoryId })
const MONTHS = ['02', '03', '04', '05', '06', '07', '08']
/** One row a month, February to August 2026, on `day`; dollars spent are negative. */
const monthly = (categoryId: string, day: string, dollars: readonly number[]) =>
  dollars.map((amount, i) => row(`2026-${MONTHS[i]!}-${day}`, amount * 100, categoryId))

/**
 * Thursday 24 September 2026, records from 1 February. Pay $4,200.00 on the
 * 5th; Rent a planned $1,200.00 on the 1st, never charged (F3); Dining out
 * on the 10th, F27's six months then $560.00; Groceries $380.00 on the 26th,
 * then $300.00; $300.00 a month to the Flight fund, then $500.00.
 */
const base: MonthReportInput = {
  asOf: d('2026-09-24'),
  month: d('2026-08-01'),
  historyStart: d('2026-02-01'),
  readFrom: d('2026-02-01'),
  categories: [
    { id: 'pay', name: 'Pay', kind: 'income', sortOrder: 0 },
    { id: 'fund', name: 'Flight fund', kind: 'savings', sortOrder: 0 },
    { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 0 },
    { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 1 },
    { id: 'coffee', name: 'Coffee', kind: 'variable', sortOrder: 2 },
    { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 0 },
  ],
  planHistory: [{ categoryId: 'rent', effectiveMonth: d('2026-02-01'), plannedCents: 120_000, dueDay: 1 }],
  entries: [
    ...monthly('pay', '05', [4_200, 4_200, 4_200, 4_200, 4_200, 4_200, 4_200]),
    ...monthly('dining', '10', [-300, -420, -360, -510, -390, -450, -560]),
    ...monthly('groceries', '26', [-380, -380, -380, -380, -380, -380, -300]),
    ...monthly('fund', '15', [-300, -300, -300, -300, -300, -300, -500]),
    row('2026-09-05', 420_000, 'pay'),
    row('2026-09-10', -20_000, 'dining'),
    row('2026-09-20', -10_000, 'fund'),
  ],
}

describe('monthReport (F36)', () => {
  it('reviews a complete month against last month and its usual month', () => {
    const report = monthReport(base)
    if (report.status !== 'complete') throw new Error(report.status)
    expect(report.window).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    // Spent: $1,200.00 rent + $560.00 + $300.00. Saved $500.00 of $4,200.00.
    expect(report.totals).toEqual({ incomeCents: 420_000, spentCents: 206_000, savedCents: 50_000, savingsRateBp: 1_190 })
    if (report.lastMonth.status !== 'compared') throw new Error('not compared')
    expect(report.lastMonth.window).toEqual({ from: '2026-07-01', to: '2026-07-31' })
    // $30.00 more spent against a band of $304.50: slight. $200.00 more saved against $45.00: big.
    expect(report.lastMonth.spent).toMatchObject({ change: { beforeCents: 203_000, changeCents: 3_000, direction: 'more', meaning: 'watch' }, size: 'slight' })
    expect(report.lastMonth.saved).toMatchObject({ change: { beforeCents: 30_000, changeCents: 20_000, meaning: 'good' }, size: 'big' })
    expect(report.lastMonth.income.change.direction).toBe('same')
    // Spent February to July: 1,880, 2,000, 1,940, 2,090, 1,970, 2,030; the middle two 1,970 and 2,000.
    expect(report.usualMonths).toBe(6)
    expect(report.usual?.spent).toMatchObject({ nowCents: 206_000, beforeCents: 198_500, changeCents: 7_500, direction: 'more', meaning: 'watch' })
    expect(report.usual?.saved).toMatchObject({ beforeCents: 30_000, changeCents: 20_000, meaning: 'good' })
    expect(report.usual?.income.direction).toBe('same')
    expect(report.movers.up.map((m) => [m.categoryId, m.changeCents])).toEqual([['dining', 15_500]])
    expect(report.movers.down.map((m) => [m.categoryId, m.changeCents])).toEqual([['groceries', -8_000]])
  })

  it('sets each Variable category beside last month, the largest first, lengths from core', () => {
    const { pairs } = monthReport(base) as Extract<ReturnType<typeof monthReport>, { pairs: unknown }>
    // On a scale to $560.00: $450.00 is 8,035.7… bp, $380.00 6,785.7…, $300.00 5,357.1…; Coffee had nothing either month.
    expect(pairs).toEqual([
      { categoryId: 'dining', nowCents: 56_000, beforeCents: 45_000, nowBp: 10_000, beforeBp: 8_036 },
      { categoryId: 'groceries', nowCents: 30_000, beforeCents: 38_000, nowBp: 5_357, beforeBp: 6_786 },
    ])
  })

  it('reviews the month so far like for like, with no usual totals', () => {
    const report = monthReport({ ...base, month: d('2026-09-01') })
    if (report.status !== 'so_far') throw new Error(report.status)
    expect(report.window).toEqual({ from: '2026-09-01', to: '2026-09-24' })
    expect(report.totals.spentCents).toBe(140_000)
    if (report.lastMonth.status !== 'compared') throw new Error('not compared')
    // 1–24 August: rent and dining; the groceries of the 26th fall outside.
    expect(report.lastMonth.spent.change.beforeCents).toBe(176_000)
    expect(report.lastMonth.spent.change.direction).toBe('less')
    expect(report.usual).toBeNull()
    // March to August, scaled to 24 of 30 days: Groceries $304.00 less (big), Dining out $148.00 less (clear).
    expect(report.movers.down.map((m) => [m.categoryId, m.changeCents, m.size])).toEqual([
      ['groceries', -30_400, 'big'],
      ['dining', -14_800, 'clear'],
    ])
  })

  it('reviews a month the records start inside, with nothing before it to compare', () => {
    const report = monthReport({ ...base, historyStart: d('2026-08-08') })
    if (report.status !== 'partly_recorded') throw new Error(report.status)
    expect(report.lastMonth).toEqual({ status: 'before_records', window: { from: '2026-07-01', to: '2026-07-31' } })
    expect(report.usual).toBeNull()
    expect(report.usualMonths).toBe(0)
    expect(report.movers).toEqual({ up: [], down: [] })
    expect(report.pairs).toEqual([])
    expect(report.totals.spentCents).toBe(206_000)
  })

  it('has nothing to review for a month not started or before the records', () => {
    expect(monthReport({ ...base, month: d('2026-10-15') })).toEqual({ status: 'not_started', month: '2026-10-01' })
    expect(monthReport({ ...base, month: d('2026-01-31') })).toEqual({ status: 'before_records', month: '2026-01-01' })
    expect(monthReport({ ...base, historyStart: null })).toEqual({ status: 'before_records', month: '2026-08-01' })
  })

  it('refuses a month that was not read, rather than review it as empty', () => {
    expect(() => monthReport({ ...base, month: d('2026-01-01'), historyStart: d('2025-06-01') })).toThrow(RangeError)
  })
})
