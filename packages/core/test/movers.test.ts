import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { biggestMovers, type MoverCategory } from '../src/index.js'

/** Suite tests, worked by hand from F36 and F27 (docs/formula-decisions.md). Now in cents; each history month in dollars. */

const d = isoDate
const MONTHS = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01']
const category = (categoryId: string, sortOrder: number, nowCents: number, history: readonly number[]): MoverCategory => ({
  categoryId,
  sortOrder,
  nowCents,
  history: history.map((dollars, i) => ({ month: d(MONTHS[i]!), cents: dollars * 100 })),
})

/**
 * Dining out's six months are F27's: usual $405.00, MAD $45.00, band
 * $135.00. Groceries' usual is $380.00 with a MAD of $5.00, so its band is
 * max($25.00, $57.00, $15.00) = $57.00. Coffee's usual is $60.00.
 */
const dining = (now: number) => category('dining', 0, now, [300, 420, 360, 510, 390, 450])
const groceries = (now: number) => category('groceries', 1, now, [370, 380, 380, 380, 390, 400])
const coffee = (now: number) => category('coffee', 2, now, [60, 60, 60, 60, 60, 60])
const whole = { days: 31, daysInMonth: 31 }

describe('biggestMovers (F36)', () => {
  it('names a category as far from its usual month as its band, up or down', () => {
    const { up, down } = biggestMovers({ ...whole, categories: [dining(56_000), groceries(30_000), coffee(6_200)] })
    // Dining out $155.00 more: 1.15 bands, clear. Groceries $80.00 less: 1.4 bands, clear. Coffee $2.00: not one.
    expect(up).toEqual([
      { categoryId: 'dining', nowCents: 56_000, usualCents: 40_500, changeCents: 15_500, bandCents: 13_500, size: 'clear', months: 6, evidence: 'solid' },
    ])
    expect(down).toEqual([
      { categoryId: 'groceries', nowCents: 30_000, usualCents: 38_000, changeCents: -8_000, bandCents: 5_700, size: 'clear', months: 6, evidence: 'solid' },
    ])
  })

  it('leaves out a change just under the band, and names one exactly on it', () => {
    expect(biggestMovers({ ...whole, categories: [dining(53_999)] }).up).toEqual([])
    expect(biggestMovers({ ...whole, categories: [dining(54_000)] }).up.map((m) => m.size)).toEqual(['clear'])
    // Two bands or more is big.
    expect(biggestMovers({ ...whole, categories: [dining(67_500)] }).up.map((m) => m.size)).toEqual(['big'])
  })

  it('sets a month so far against its usual month scaled to the days, band and all', () => {
    // Day 24 of 30: usual $405.00 × 24 ÷ 30 = $324.00, band $108.00.
    const so = { days: 24, daysInMonth: 30 }
    expect(biggestMovers({ ...so, categories: [dining(40_000)] }).up).toEqual([])
    expect(biggestMovers({ ...so, categories: [dining(43_200)] }).up).toEqual([
      { categoryId: 'dining', nowCents: 43_200, usualCents: 32_400, changeCents: 10_800, bandCents: 10_800, size: 'clear', months: 6, evidence: 'solid' },
    ])
  })

  it('keeps the three largest each way, ties by the list’s order', () => {
    const quiet = (id: string, order: number, now: number) => category(id, order, now, [100, 100, 100])
    // Each usual $100.00 on three months, band $25.00.
    const { up, down } = biggestMovers({
      ...whole,
      categories: [quiet('a', 4, 15_000), quiet('b', 3, 17_000), quiet('c', 2, 15_000), quiet('d', 1, 19_000), quiet('e', 0, 3_000), quiet('f', 5, 6_000)],
    })
    expect(up.map((m) => m.categoryId)).toEqual(['d', 'b', 'c'])
    expect(down.map((m) => m.categoryId)).toEqual(['e', 'f'])
    expect(up[0]?.evidence).toBe('some')
  })

  it('never names a category with no complete month to be usual against', () => {
    expect(biggestMovers({ ...whole, categories: [category('new', 0, 90_000, [])] })).toEqual({ up: [], down: [] })
  })

  it('uses the wider band on one or two months', () => {
    // One month of $400.00: the band is max($25.00, 25% of $400.00) = $100.00.
    expect(biggestMovers({ ...whole, categories: [category('x', 0, 49_900, [400])] }).up).toEqual([])
    expect(biggestMovers({ ...whole, categories: [category('x', 0, 50_000, [400])] }).up.map((m) => m.evidence)).toEqual(['thin'])
  })
})
