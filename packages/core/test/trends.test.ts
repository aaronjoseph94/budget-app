import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { trendLabel, type TrendLabelInput } from '../src/index.js'

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
