import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { categoryTrends, monthlyTrend, trendLabel, type TrendLabelInput, type TrendWindowInput } from '../src/index.js'

/** Suite tests, worked by hand from F37 and F27 (docs/formula-decisions.md). Each month's figure in dollars. */

const d = isoDate
const MONTHS = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']
/** The last figure is August's, the one before July's, and so on back. */
const series = (dollars: readonly number[]): TrendLabelInput['totals'] =>
  dollars.map((v, i) => ({ month: d(MONTHS[MONTHS.length - dollars.length + i]!), cents: v * 100 }))
const label = (dollars: readonly number[], over: Partial<TrendLabelInput> = {}) =>
  trendLabel({ asOf: d('2026-09-25'), historyStart: d('2026-02-01'), totals: series(dollars), ...over })

describe('trendLabel (F37)', () => {
  it('calls a line rising steadily when 4 of its 5 pairs rise and it climbed past its band', () => {
    // F37's Dining out: usual $360.00, MAD $45.00, band $135.00; $450 − $300 = $150.
    expect(label([300, 340, 330, 380, 420, 450])).toEqual({
      status: 'rising',
      months: 6,
      pairs: 5,
      rises: 4,
      falls: 1,
      firstMonth: '2026-03-01',
      lastMonth: '2026-08-01',
      firstCents: 30_000,
      lastCents: 45_000,
      usualCents: 36_000,
      bandCents: 13_500,
      evidence: 'solid',
    })
  })

  it('says no clear trend when the pairs rise but the climb is inside the band', () => {
    // F37's Groceries: band $61.88, and only $25.00 from first to last.
    expect(label([400, 410, 420, 405, 415, 425])).toMatchObject({ status: 'no_trend', rises: 4, bandCents: 6_188 })
  })

  it('says no clear trend when only 3 of 5 pairs rise, however far the line climbed', () => {
    expect(label([300, 500, 400, 600, 500, 700])).toMatchObject({ status: 'no_trend', rises: 3, falls: 2 })
    // F37's Coffee: under $1.00 either way is neither.
    expect(label([60, 62, 59, 61, 60, 63])).toMatchObject({ status: 'no_trend', rises: 3, falls: 2 })
  })

  it('calls the mirror falling steadily', () => {
    expect(label([450, 420, 380, 330, 340, 300])).toMatchObject({ status: 'falling', rises: 1, falls: 4, firstCents: 45_000, lastCents: 30_000 })
  })

  it('needs every pair of 4 months, 3 of 3, and 3 of 4 pairs with 5', () => {
    // Four months: usual ($130 + $160) ÷ 2 = $145, MAD ($15 + $45) ÷ 2 = $30, band max($25, $21.75, $90) = $90,
    // and $190 − $100 is exactly one band.
    expect(label([100, 130, 160, 190])).toMatchObject({ status: 'rising', months: 4, pairs: 3, rises: 3, bandCents: 9_000 })
    expect(label([100, 130, 120, 190])).toMatchObject({ status: 'no_trend', rises: 2 })
    expect(label([100, 130, 120, 160, 200])).toMatchObject({ status: 'rising', pairs: 4, rises: 3 })
  })

  it('counts a pair under $1.00 apart as neither, one exactly $1.00 apart as a rise, and a climb exactly one band as past it', () => {
    const cents = (values: readonly number[]) => values.map((v, i) => ({ month: d(MONTHS[3 + i]!), cents: v }))
    const at = (values: readonly number[]) => trendLabel({ asOf: d('2026-09-25'), historyStart: d('2026-02-01'), totals: cents(values) })
    expect(at([10_000, 10_100, 10_200, 20_000])).toMatchObject({ rises: 3, falls: 0, status: 'rising' })
    expect(at([10_000, 10_099, 10_198, 20_000])).toMatchObject({ rises: 1, falls: 0, status: 'no_trend' })
    // A band of $25.00, the floor: a climb of $24.99 is inside it, and $25.00 is on it.
    expect(at([10_000, 10_800, 11_600, 12_499])).toMatchObject({ rises: 3, bandCents: 2_500, status: 'no_trend' })
    expect(at([10_000, 10_800, 11_600, 12_500])).toMatchObject({ rises: 3, bandCents: 2_500, status: 'rising' })
  })

  it('reads only the last 6 months, in any order given', () => {
    // February's $900 would make August's rise a fall from first to last.
    const seven = label([900, 300, 340, 330, 380, 420, 450])
    expect(seven).toMatchObject({ status: 'rising', months: 6, firstMonth: '2026-03-01' })
    const shuffled = [...series([300, 340, 330, 380, 420, 450])].reverse()
    expect(trendLabel({ asOf: d('2026-09-25'), historyStart: d('2026-02-01'), totals: shuffled })).toEqual(label([300, 340, 330, 380, 420, 450]))
  })

  it('never labels 3 months, and names the month it becomes possible', () => {
    expect(label([300, 400, 500])).toEqual({ status: 'not_enough', months: 3, possibleFrom: '2026-10-01' })
    expect(label([])).toEqual({ status: 'not_enough', months: 0, possibleFrom: '2027-01-01' })
  })

  it('counts from the first whole month when the records start partway through one', () => {
    // From 8 August: September is the first whole month, so September to December make four, and January is the month.
    expect(label([], { historyStart: d('2026-08-08') })).toEqual({ status: 'not_enough', months: 0, possibleFrom: '2027-01-01' })
    // From 8 September: October is the first whole month.
    expect(label([], { historyStart: d('2026-09-08') })).toEqual({ status: 'not_enough', months: 0, possibleFrom: '2027-02-01' })
    // From 1 August: August is whole.
    expect(label([500], { historyStart: d('2026-08-01') })).toEqual({ status: 'not_enough', months: 1, possibleFrom: '2026-12-01' })
  })

  it('names no month when there are no records at all', () => {
    expect(label([], { historyStart: null })).toEqual({ status: 'not_enough', months: 0, possibleFrom: null })
  })
})

/**
 * Friday 25 September 2026, records from 1 March: March to August are
 * complete. Pay $4,000.00 on the 5th; Rent a planned $1,200.00 on the 1st,
 * never charged, so every month counts it (F3); Dining out and Coffee are
 * F37's; Books falls $100 to $50; Gym is never charged; $200.00 a month to
 * the fund, then $500.00 in August.
 */
const SPENT: Readonly<Record<string, readonly number[]>> = {
  dining: [300, 340, 330, 380, 420, 450],
  coffee: [60, 62, 59, 61, 60, 63],
  books: [100, 90, 80, 70, 60, 50],
}
const row = (postedOn: string, dollars: number, categoryId: string) => ({ postedOn: d(postedOn), amountCents: dollars * 100, categoryId })
const window: TrendWindowInput = {
  asOf: d('2026-09-25'),
  historyStart: d('2026-03-01'),
  readFrom: d('2025-09-01'),
  months: 6,
  categories: [
    { id: 'pay', name: 'Pay', kind: 'income', sortOrder: 0 },
    { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 0 },
    { id: 'coffee', name: 'Coffee', kind: 'variable', sortOrder: 0 },
    { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 1 },
    { id: 'books', name: 'Books', kind: 'variable', sortOrder: 2 },
    { id: 'gym', name: 'Gym', kind: 'variable', sortOrder: 3 },
    { id: 'fund', name: 'Flight fund', kind: 'savings', sortOrder: 0 },
  ],
  entries: MONTHS.slice(1).flatMap((m, i) => [
    row(`${m.slice(0, 8)}05`, 4_000, 'pay'),
    ...Object.entries(SPENT).map(([id, dollars]) => row(`${m.slice(0, 8)}12`, -dollars[i]!, id)),
    row(`${m.slice(0, 8)}15`, i === 5 ? -500 : -200, 'fund'),
  ]).concat([row('2026-09-10', -900, 'dining')]),
}
const plans = [{ categoryId: 'rent', effectiveMonth: d('2026-03-01'), plannedCents: 120_000, dueDay: 1 }]

describe('monthlyTrend (F37)', () => {
  it('gives Income, Spent and Saved for each month of the window, oldest first, on one scale from $0', () => {
    const trend = monthlyTrend({ ...window, planHistory: plans })
    expect(trend.months).toEqual(['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'])
    // Spent: $1,200 of rent planned plus the three categories: $1,660, $1,692, $1,669, $1,711, $1,740, $1,763.
    expect(trend.spent.points).toEqual([166_000, 169_200, 166_900, 171_100, 174_000, 176_300])
    expect(trend.income.points).toEqual([400_000, 400_000, 400_000, 400_000, 400_000, 400_000])
    expect(trend.saved.points).toEqual([20_000, 20_000, 20_000, 20_000, 20_000, 50_000])
    // Heights over $0 to $4,000: $1,763 is 4,407.5 bp, half-up.
    expect(trend.zeroBp).toBe(0)
    expect(trend.income.pointsBp).toEqual([10_000, 10_000, 10_000, 10_000, 10_000, 10_000])
    expect(trend.spent.pointsBp).toEqual([4_150, 4_230, 4_173, 4_278, 4_350, 4_408])
    expect(trend.saved.pointsBp).toEqual([500, 500, 500, 500, 500, 1_250])
  })

  it('labels each line by F37, the spending’s climb inside its band', () => {
    // Spent rises in 4 of 5 pairs, but $103.00 is under max($25.00, 15% of $1,701.50 = $255.23, 3 × $35.50).
    const trend = monthlyTrend({ ...window, planHistory: plans })
    expect(trend.spent.label).toMatchObject({ status: 'no_trend', rises: 4, bandCents: 25_523 })
    expect(trend.income.label).toMatchObject({ status: 'no_trend', rises: 0, falls: 0 })
  })

  it('leaves a gap, never $0, for each month before the records or the read, and never draws this month', () => {
    const year = monthlyTrend({ ...window, months: 12, planHistory: plans })
    expect(year.months[0]).toBe('2025-09-01')
    expect(year.spent.points.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(year.spent.pointsBp.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(year.spent.points[11]).toBe(176_300)
    expect(monthlyTrend({ ...window, readFrom: d('2026-05-01'), planHistory: plans }).spent.points.slice(0, 3)).toEqual([null, null, 166_900])
  })

  it('names the month a label becomes possible, on too few months', () => {
    const late = monthlyTrend({ ...window, historyStart: d('2026-06-10'), planHistory: plans })
    expect(late.spent.points).toEqual([null, null, null, null, 174_000, 176_300])
    expect(late.spent.label).toEqual({ status: 'not_enough', months: 2, possibleFrom: '2026-11-01' })
  })
})

describe('categoryTrends (F37)', () => {
  it('draws each Variable category against its usual level, steady ones first, and leaves out one never charged', () => {
    const { categories } = categoryTrends(window)
    expect(categories.map((c) => [c.categoryId, c.label.status])).toEqual([
      ['dining', 'rising'],
      ['books', 'falling'],
      ['coffee', 'no_trend'],
    ])
    const dining = categories[0]!
    expect(dining.points).toEqual([30_000, 34_000, 33_000, 38_000, 42_000, 45_000])
    expect(dining.usualCents).toBe(36_000)
    // Its own scale, $0 to $450.00: $300.00 is 6,666.67 bp, half-up.
    expect(dining.pointsBp).toEqual([6_667, 7_556, 7_333, 8_444, 9_333, 10_000])
    expect(dining.usualBp).toBe(8_000)
    expect(dining.zeroBp).toBe(0)
  })

  it('leaves a gap before the records, and still gives a usual level on too few months', () => {
    const { months, categories } = categoryTrends({ ...window, historyStart: d('2026-06-10'), months: 12 })
    expect(months).toHaveLength(12)
    const dining = categories.find((c) => c.categoryId === 'dining')!
    expect(dining.points).toEqual([null, null, null, null, null, null, null, null, null, null, 42_000, 45_000])
    expect(dining.usualCents).toBe(43_500)
    expect(dining.label).toEqual({ status: 'not_enough', months: 2, possibleFrom: '2026-11-01' })
    // A category whose only charges are before the records is not a line of gaps.
    expect(categoryTrends({ ...window, historyStart: d('2026-09-01') }).categories).toEqual([])
  })
})
