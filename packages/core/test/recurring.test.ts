import { describe, expect, it } from 'vitest'
import { addDays, isoDate } from '@budget/money-primitives'
import { recurringCharges, type RecurringInput, type ShopEntry } from '../src/index.js'
import { CATEGORIES, charges, row } from './shop-example.js'

/** Suite tests, worked by hand from F38 (docs/formula-decisions.md). */

const d = isoDate
const found = (entries: readonly ShopEntry[], over: Partial<RecurringInput> = {}) =>
  recurringCharges({
    asOf: d('2026-09-24'),
    historyStart: d('2026-02-01'),
    readFrom: d('2026-02-01'),
    categories: CATEGORIES,
    entries,
    notSubscriptions: [],
    ...over,
  }).series

/** Charges `gaps` days apart from `first`, each `dollars`, or one amount per charge. */
function every(first: string, gaps: readonly number[], dollars: number | readonly number[], shop = 'SHOP', categoryId = 'dining'): ShopEntry[] {
  const dates = gaps.reduce<string[]>((all, gap) => [...all, addDays(d(all[all.length - 1]!), gap)], [first])
  return dates.map((date, i) => row(date, -(typeof dollars === 'number' ? dollars : dollars[i]!), shop, categoryId))
}

const SPOTIFY = [...charges(['2026-05-14', '2026-06-14', '2026-07-14', '2026-08-14'], -11.99, 'SPOTIFY', 'music'), row('2026-09-14', -12.99, 'SPOTIFY', 'music')]

describe('recurringCharges (F38)', () => {
  it('finds a monthly charge, its next date and a year of it, and a price rise', () => {
    expect(found(SPOTIFY)).toEqual([
      {
        shop: 'SPOTIFY',
        categoryId: 'music',
        cadence: 'monthly',
        charges: 5,
        first: '2026-05-14',
        last: '2026-09-14',
        lastId: SPOTIFY[4]!.id,
        medianCents: 1_199,
        priceCents: 1_299,
        gapDays: 31,
        next: '2026-10-15',
        yearCents: 15_588,
        monthCents: 1_299,
        priceChange: { beforeCents: 1_199, nowCents: 1_299, direction: 'up' },
        isNew: false,
      },
    ])
  })

  it('reads each band to its edges, and no further', () => {
    const cadence = (first: string, gaps: readonly number[], asOf = '2026-09-24') =>
      found(every(first, gaps, 10), { asOf: d(asOf), historyStart: d('2023-01-01'), readFrom: d('2023-01-01') })[0]?.cadence ?? 'none'
    expect(cadence('2026-09-10', [6, 8])).toBe('weekly')
    expect(cadence('2026-09-10', [5, 6])).toBe('none')
    expect(cadence('2026-09-05', [8, 9])).toBe('none')
    expect(cadence('2026-08-26', [12, 16])).toBe('fortnightly')
    expect(cadence('2026-08-26', [11, 16])).toBe('none')
    expect(cadence('2026-08-20', [17, 12])).toBe('none')
    expect(cadence('2026-07-20', [26, 35])).toBe('monthly')
    expect(cadence('2026-07-20', [25, 35])).toBe('none')
    expect(cadence('2026-07-20', [26, 36])).toBe('none')
    expect(cadence('2024-09-01', [350, 380])).toBe('yearly')
    expect(cadence('2024-09-01', [349, 380])).toBe('none')
    expect(cadence('2024-09-01', [381, 350])).toBe('none')
    // Every gap in one band: a week then a month is no series.
    expect(cadence('2026-08-10', [7, 30])).toBe('none')
  })

  it('needs 3 charges; 2 are never a series', () => {
    expect(found(every('2026-08-01', [30], 10))).toEqual([])
    expect(found(every('2026-07-02', [30, 30], 10))).toHaveLength(1)
  })

  it('flags a 3% rise, and not one under 50 cents or under 2%', () => {
    const latest = (dollars: readonly number[]) => found(every('2026-06-01', [30, 30, 30], dollars))[0]?.priceChange
    expect(latest([20, 20, 20, 20.6])).toEqual({ beforeCents: 2_000, nowCents: 2_060, direction: 'up' })
    expect(latest([10, 10, 10, 10.4])).toBeNull()
    expect(latest([50, 50, 50, 50.9])).toBeNull()
    expect(latest([20, 20, 20, 19])).toEqual({ beforeCents: 2_000, nowCents: 1_900, direction: 'down' })
  })

  it('judges the latest charge apart, so a rise past 10% still shows, and one past half is another purchase', () => {
    const netflix = found(every('2026-06-03', [30, 31, 31], [15.99, 15.99, 15.99, 18.99], 'NETFLIX'))
    expect(netflix[0]).toMatchObject({ medianCents: 1_599, priceCents: 1_899, yearCents: 22_788, monthCents: 1_899, priceChange: { direction: 'up' } })
    expect(found(every('2026-06-03', [30, 31, 31], [15.99, 15.99, 15.99, 24.1]))).toEqual([])
  })

  it('holds every charge before the latest to max($1.00, 10%) of their median', () => {
    expect(found(every('2026-06-01', [30, 30, 30], [10, 12.5, 10, 10]))).toEqual([])
    // $30.00: 10% is $3.00, so $33.00 is inside and $33.01 is not.
    expect(found(every('2026-06-01', [30, 30, 30], [30, 33, 30, 30]))).toHaveLength(1)
    expect(found(every('2026-06-01', [30, 30, 30], [30, 33.01, 30, 30]))).toEqual([])
  })

  it('leaves out a series that has stopped, once the longest gap has passed', () => {
    // 19 August + 36 days is 24 September.
    expect(found(every('2026-06-20', [30, 30], 10), { asOf: d('2026-09-23') })).toHaveLength(1)
    expect(found(every('2026-06-20', [30, 30], 10))).toEqual([])
  })

  it('calls a series new when it began in the last 100 days and the records could have seen it before', () => {
    // The fourth charge is after 24 September, so not read until later.
    const gym = every('2026-07-20', [31, 31, 31], 45, 'GYM')
    expect(found(gym)[0]).toMatchObject({ isNew: true, next: '2026-10-21', yearCents: 54_000 })
    // Records from 1 July: 19 days before the first charge, under a month's 35.
    expect(found(gym, { historyStart: d('2026-07-01') })[0]!.isNew).toBe(false)
    // 101 days after the first charge.
    expect(found(gym, { asOf: d('2026-10-29') })[0]).toMatchObject({ charges: 4, isNew: false })
  })

  it('never lists a shop marked not a subscription, and puts the dearest first', () => {
    const both = [...SPOTIFY, ...every('2026-07-20', [31, 31], 45, 'GYM')]
    expect(found(both).map((s) => s.shop)).toEqual(['GYM', 'SPOTIFY'])
    expect(found(both, { notSubscriptions: ['GYM'] }).map((s) => s.shop)).toEqual(['SPOTIFY'])
  })

  it('reads charges only: a refund between them is not a gap', () => {
    expect(found([...SPOTIFY, row('2026-06-20', 11.99, 'SPOTIFY', 'music')])).toHaveLength(1)
  })
})
