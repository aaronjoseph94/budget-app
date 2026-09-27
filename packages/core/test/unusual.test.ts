import { describe, expect, it } from 'vitest'
import { addDays, isoDate } from '@budget/money-primitives'
import { unusualCharges, type ShopEntry, type UnusualInput } from '../src/index.js'
import { CATEGORIES, row } from './shop-example.js'

/** Suite tests, worked by hand from F39 (docs/formula-decisions.md). */

const d = isoDate
const SEPTEMBER = { from: d('2026-09-01'), to: d('2026-09-24') }
const flagged = (entries: readonly ShopEntry[], over: Partial<UnusualInput> = {}) =>
  unusualCharges({ window: SEPTEMBER, historyStart: d('2026-02-01'), readFrom: d('2026-02-01'), categories: CATEGORIES, entries, ...over })

/** `count` Dining out charges of `dollars`, a week apart, the last on `last`, at a shop seen all along. */
function usual(count: number, dollars: number, last = '2026-09-19'): ShopEntry[] {
  return Array.from({ length: count }, (_, i) => row(addDays(d(last), -7 * (count - 1 - i)), -dollars, 'CAFE'))
}

describe('unusualCharges (F39): a large charge', () => {
  it('flags a charge three times the category’s usual, F39’s worked example', () => {
    const big = row('2026-09-20', -180, 'CAFE')
    const result = flagged([...usual(12, 25), big])
    expect(result.large).toEqual([
      { id: big.id, postedOn: '2026-09-20', shop: 'CAFE', categoryId: 'dining', by: 'statement', amountCents: 18_000, usualCents: 2_500, thresholdCents: 7_500, earlier: 12 },
    ])
  })

  it('never calls a charge under $50.00 large, and $50.00 is', () => {
    expect(flagged([...usual(5, 10), row('2026-09-20', -49.99, 'CAFE')]).large).toEqual([])
    expect(flagged([...usual(5, 10), row('2026-09-20', -50, 'CAFE')]).large).toHaveLength(1)
  })

  it('never judges a category with fewer than 5 earlier charges in the 90 days before', () => {
    expect(flagged([...usual(4, 10), row('2026-09-20', -500, 'CAFE')]).large).toEqual([])
    // 22 June is 90 days before 20 September, and counts; 21 June does not.
    const four = usual(4, 10)
    expect(flagged([row('2026-06-22', -10, 'CAFE'), ...four, row('2026-09-20', -500, 'CAFE')]).large).toHaveLength(1)
    expect(flagged([row('2026-06-21', -10, 'CAFE'), ...four, row('2026-09-20', -500, 'CAFE')]).large).toEqual([])
  })

  it('counts a charge with no shop toward its category, and never flags one', () => {
    const noShop = Array.from({ length: 5 }, (_, i) => row(addDays(d('2026-09-01'), i), -10, ''))
    expect(flagged([...noShop, row('2026-09-20', -60, 'CAFE'), row('2026-09-21', -600, '')]).large.map((c) => c.amountCents)).toEqual([6_000])
  })

  it('looks only at charges in the window', () => {
    expect(flagged([...usual(12, 25), row('2026-09-20', -180, 'CAFE')], { window: { from: d('2026-09-21'), to: d('2026-09-24') } }).large).toEqual([])
  })
})

describe('unusualCharges (F39): a new shop', () => {
  it('flags $100.00 or more at a shop never seen, after 60 days of records', () => {
    const sofa = row('2026-09-12', -450, 'FURNITURE CO', 'groceries')
    expect(flagged([sofa]).newShop).toEqual([{ id: sofa.id, postedOn: '2026-09-12', shop: 'FURNITURE CO', categoryId: 'groceries', by: 'statement', amountCents: 45_000 }])
    expect(flagged([row('2026-09-12', -99.99, 'FURNITURE CO')]).newShop).toEqual([])
    // 14 July to 12 September is 60 days; 15 July is 59.
    expect(flagged([sofa], { historyStart: d('2026-07-14') }).newShop).toHaveLength(1)
    expect(flagged([sofa], { historyStart: d('2026-07-15') }).newShop).toEqual([])
  })

  it('never calls a shop new with any earlier row there, a refund included, nor a charge already called large', () => {
    expect(flagged([row('2026-05-02', 20, 'FURNITURE CO'), row('2026-09-12', -450, 'FURNITURE CO')]).newShop).toEqual([])
    // Two on its first day: the first listed is the new shop's, the second has a row before it.
    const [first, second] = [row('2026-09-12', -450, 'FURNITURE CO'), row('2026-09-12', -200, 'FURNITURE CO')]
    expect(flagged([second, first]).newShop.map((c) => c.id)).toEqual([first.id])
    const result = flagged([...usual(12, 25), row('2026-09-20', -180, 'BISTRO')])
    expect([result.large.length, result.newShop.length]).toEqual([1, 0])
  })
})

describe('unusualCharges (F39): charged or counted twice', () => {
  it('flags the same charge at one shop within 3 days as a possible double, never 4 days apart', () => {
    const [a, b] = [row('2026-09-21', -4.5, 'COFFEE HOUSE'), row('2026-09-23', -4.5, 'COFFEE HOUSE')]
    expect(flagged([a, b]).doubles).toEqual([
      {
        shop: 'COFFEE HOUSE',
        amountCents: 450,
        first: { id: a.id, postedOn: '2026-09-21', shop: 'COFFEE HOUSE', categoryId: 'dining', by: 'statement', amountCents: 450 },
        second: { id: b.id, postedOn: '2026-09-23', shop: 'COFFEE HOUSE', categoryId: 'dining', by: 'statement', amountCents: 450 },
      },
    ])
    expect(flagged([row('2026-09-19', -4.5, 'COFFEE HOUSE'), row('2026-09-23', -4.5, 'COFFEE HOUSE')]).doubles).toEqual([])
    expect(flagged([row('2026-09-21', -4.5, 'COFFEE HOUSE'), row('2026-09-21', -4.55, 'COFFEE HOUSE')]).doubles).toEqual([])
    expect(flagged([row('2026-09-21', -4.5, 'COFFEE HOUSE'), row('2026-09-21', -4.5, 'TEA ROOM')]).doubles).toEqual([])
    // Two rows that name no shop are never one shop's double.
    expect(flagged([row('2026-09-21', -4.5, ''), row('2026-09-22', -4.5, '')]).doubles).toEqual([])
  })

  it('flags a pair whose later row is in the window, and never a refund', () => {
    expect(flagged([row('2026-08-30', -9, 'GYM'), row('2026-09-01', -9, 'GYM')]).doubles).toHaveLength(1)
    expect(flagged([row('2026-08-28', -9, 'GYM'), row('2026-08-30', -9, 'GYM')]).doubles).toEqual([])
    expect(flagged([row('2026-09-02', 9, 'GYM'), row('2026-09-03', 9, 'GYM')]).doubles).toEqual([])
  })

  it('says a typed charge and a statement’s of the same amount within 3 days may be counted twice, whatever each calls the shop', () => {
    const typed = row('2026-09-22', -6.25, 'COFFEE', 'dining', 'hand')
    const card = row('2026-09-23', -6.25, 'COFFEE HOUSE')
    const result = flagged([typed, card])
    expect(result.countedTwice).toMatchObject([{ shop: 'COFFEE HOUSE', amountCents: 625, first: { id: typed.id, by: 'hand' }, second: { id: card.id, by: 'statement' } }])
    // Named by the statement's row whichever came first, and by the typed one's when the statement has no shop.
    const later = row('2026-09-24', -6.25, 'COFFEE', 'dining', 'hand')
    expect(flagged([card, later]).countedTwice[0]!.shop).toBe('COFFEE HOUSE')
    expect(flagged([row('2026-09-22', -6.25, 'COFFEE', 'dining', 'hand'), row('2026-09-23', -6.25, '')]).countedTwice[0]!.shop).toBe('COFFEE')
    expect(result.doubles).toEqual([])
    expect(flagged([row('2026-09-19', -6.25, 'COFFEE', 'dining', 'hand'), card]).countedTwice).toEqual([])
  })

  it('lists a pair that is both only as counted twice, and two typed rows as a possible double', () => {
    const both = flagged([row('2026-09-22', -6.25, 'COFFEE HOUSE', 'dining', 'hand'), row('2026-09-23', -6.25, 'COFFEE HOUSE')])
    expect([both.countedTwice.length, both.doubles.length]).toEqual([1, 0])
    const typed = flagged([row('2026-09-22', -6.25, 'COFFEE', 'dining', 'hand'), row('2026-09-22', -6.25, 'COFFEE', 'dining', 'hand')])
    expect([typed.countedTwice.length, typed.doubles.length]).toEqual([0, 1])
  })
})
