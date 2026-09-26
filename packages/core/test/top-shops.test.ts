import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { topShops, type ShopEntry, type TopShopsInput } from '../src/index.js'
import { CATEGORIES, charges, row } from './shop-example.js'

/** Suite tests, worked by hand from F41 (docs/formula-decisions.md). */

const d = isoDate
const shops = (entries: readonly ShopEntry[], over: Partial<TopShopsInput> = {}) =>
  topShops({
    asOf: d('2026-09-24'),
    month: d('2026-09-01'),
    historyStart: d('2026-02-01'),
    readFrom: d('2026-02-01'),
    categories: CATEGORIES,
    entries,
    ...over,
  })

/** F41's worked example. */
const EXAMPLE = [
  row('2026-09-03', -42.1, 'SUSHI PLACE'),
  row('2026-09-19', -84.2, 'SUSHI PLACE'),
  row('2026-08-10', -60, 'SUSHI PLACE'),
  // After 24 August: outside the same days of last month.
  row('2026-08-30', -30, 'SUSHI PLACE'),
  row('2026-09-05', -250, 'GROCER', 'groceries'),
  row('2026-09-12', 20, 'GROCER', 'groceries'),
  row('2026-07-02', -100, 'GROCER', 'groceries'),
  row('2026-09-02', 15, 'BOOKSHOP'),
  row('2026-09-10', -45, 'NEW GYM'),
]

describe('topShops (F41)', () => {
  it('ranks each shop by its charges less its refunds, against the same days of last month', () => {
    const result = shops(EXAMPLE)
    expect(result).toMatchObject({ status: 'ready', now: { from: '2026-09-01', to: '2026-09-24' }, before: { from: '2026-08-01', to: '2026-08-24' } })
    if (result.status !== 'ready') throw new Error('expected shops')
    expect(result.shops.map((s) => [s.shop, s.nowCents, s.charges])).toEqual([
      ['GROCER', 23_000, 1],
      ['SUSHI PLACE', 12_630, 2],
      ['NEW GYM', 4_500, 1],
    ])
    expect(result.shops[1]!.before).toMatchObject({ beforeCents: 6_000, changeCents: 6_630, direction: 'more', meaning: 'watch' })
    // Nothing there last month: a change, and no percentage.
    expect(result.shops[0]!.before).toMatchObject({ beforeCents: 0, changeCents: 23_000, changeBp: null })
  })

  it('names the shops new this month, never one seen before it', () => {
    const result = shops(EXAMPLE)
    if (result.status !== 'ready') throw new Error('expected shops')
    expect(result.newShops).toEqual([{ shop: 'NEW GYM', nowCents: 4_500, charges: 1 }])
  })

  it('leaves out rows off the spending lists, and rows with no shop', () => {
    const result = shops([
      row('2026-09-01', 2000, 'PAYROLL', 'pay'),
      row('2026-09-02', -500, 'CARD PAYMENT', 'card'),
      row('2026-09-03', -300, 'FLIGHT FUND', 'fund'),
      row('2026-09-04', -10, ''),
      row('2026-09-05', -1600, 'LANDLORD', 'rent'),
    ])
    if (result.status !== 'ready') throw new Error('expected shops')
    expect(result.shops.map((s) => s.shop)).toEqual(['LANDLORD'])
  })

  it('keeps the top 10, ties by shop', () => {
    const many = 'LKJIHGFEDCBA'.split('').map((letter) => row('2026-09-02', -10, `SHOP ${letter}`))
    const result = shops(many)
    if (result.status !== 'ready') throw new Error('expected shops')
    expect(result.shops.map((s) => s.shop.slice(-1)).join('')).toBe('ABCDEFGHIJ')
    expect(result.newShops).toHaveLength(10)
  })

  it('compares nothing, and calls no shop new, when the records start inside last month', () => {
    const result = shops(EXAMPLE, { historyStart: d('2026-08-08') })
    expect(result).toMatchObject({ status: 'ready', before: null, newShops: null })
    if (result.status !== 'ready') throw new Error('expected shops')
    expect(result.shops.every((s) => s.before === null)).toBe(true)
  })

  it('sets a month that is over against the whole month before', () => {
    const result = shops([...charges(['2026-08-31'], -12, 'TEA'), ...charges(['2026-07-31'], -10, 'TEA')], { month: d('2026-08-01') })
    expect(result).toMatchObject({ now: { from: '2026-08-01', to: '2026-08-31' }, before: { from: '2026-07-01', to: '2026-07-31' } })
    if (result.status !== 'ready') throw new Error('expected shops')
    expect(result.shops[0]!.before).toMatchObject({ nowCents: 1_200, beforeCents: 1_000 })
  })

  it('calls shops new only when the records covered begin 60 days or more before the month', () => {
    const gym = [row('2026-09-10', -45, 'NEW GYM')]
    const at = (from: string, over: Partial<TopShopsInput> = {}) => {
      const result = shops(gym, { historyStart: d(from), ...over })
      return result.status === 'ready' ? result.newShops : 'none'
    }
    // 3 July to 1 September is 60 days.
    expect(at('2026-07-03')).toHaveLength(1)
    expect(at('2026-07-04')).toBeNull()
    // What was read counts as much as the records: a later first day read is the later start.
    expect(at('2026-02-01', { readFrom: d('2026-07-04') })).toBeNull()
  })

  it('has nothing for a month not begun', () => {
    expect(shops(EXAMPLE, { month: d('2026-10-01') })).toEqual({ status: 'not_started' })
  })
})
