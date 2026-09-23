import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { periodSheet, type PeriodCategory, type PeriodEntry, type PeriodPlan } from '../src/period-sheet.js'
import { goalBars } from '../src/shares.js'

/**
 * Suite tests, worked by hand. Workbook's charts print no number and the
 * sample's doughnut is empty (F17), so there is no cached share to replay.
 */

const cat = (id: string, kind: PeriodCategory['kind'], sortOrder: number): PeriodCategory => ({
  id,
  name: id,
  kind,
  sortOrder,
})
const row = (amountCents: number, categoryId: string): PeriodEntry => ({
  postedOn: isoDate('2026-09-10'),
  amountCents,
  categoryId,
})
const sheet = (categories: PeriodCategory[], entries: PeriodEntry[], plans: PeriodPlan[] = []) =>
  periodSheet({
    from: isoDate('2026-09-01'),
    to: isoDate('2026-09-30'),
    categories,
    budgets: [],
    plans,
    entries,
    statementPeriodEnds: [],
    startingBalanceCents: null,
  })
const shares = (s: ReturnType<typeof sheet>, block: keyof ReturnType<typeof sheet>['blocks']) =>
  s.blocks[block].rows.map((r) => [r.categoryId, r.shareBp])

describe('shareBp (F17)', () => {
  const VARIABLE = [cat('food', 'variable', 0), cat('fuel', 'variable', 1), cat('fun', 'variable', 2)]

  it('gives each row its part of the block, in basis points, over several rows each', () => {
    // Food 400 + 200 = 600, fuel 250 + 50 = 300, fun 100: of 1,000.
    const s = sheet(VARIABLE, [row(-40_000, 'food'), row(-20_000, 'food'), row(-25_000, 'fuel'), row(-5_000, 'fuel'), row(-10_000, 'fun')])
    expect(shares(s, 'variable')).toEqual([
      ['food', 6_000],
      ['fuel', 3_000],
      ['fun', 1_000],
    ])
  })

  it('rounds half-up to a basis point, so the shares can add to one more than the whole', () => {
    // 1 of 20,000 cents is 0.5 bp, and 19,999 of them 9,999.5.
    const s = sheet(VARIABLE, [row(-1, 'food'), row(-19_999, 'fuel')])
    expect(shares(s, 'variable')).toEqual([
      ['food', 1],
      ['fuel', 10_000],
      ['fun', null],
    ])
    // A third each way rounds down, and two thirds up.
    expect(shares(sheet(VARIABLE, [row(-1, 'food'), row(-2, 'fuel')]), 'variable').slice(0, 2)).toEqual([
      ['food', 3_333],
      ['fuel', 6_667],
    ])
  })

  // A doughnut cannot draw a slice below zero, and a share of the net total
  // would not close the ring: the refund row has no share, and the rest are
  // of the rows above zero only.
  it('gives no share to a row that refunds took below zero, and leaves it out of the whole', () => {
    // Fun 40.00 + 10.00 − a 46.00 refund = 4.00, still above zero: 400 of 40,000.
    const s = sheet(VARIABLE, [row(-30_000, 'food'), row(-9_600, 'fuel'), row(4_600, 'fun'), row(-4_000, 'fun'), row(-1_000, 'fun')])
    expect(s.blocks.variable.rows.map((r) => [r.categoryId, r.actualCents, r.shareBp])).toEqual([
      ['food', 30_000, 7_500],
      ['fuel', 9_600, 2_400],
      ['fun', 400, 100],
    ])
    const refunded = sheet(VARIABLE, [row(-30_000, 'food'), row(-10_000, 'fuel'), row(4_599, 'fun')])
    expect(shares(refunded, 'variable')).toEqual([
      ['food', 7_500],
      ['fuel', 2_500],
      ['fun', null],
    ])
  })

  it('gives none at all when nothing in the block is above zero', () => {
    const s = sheet(VARIABLE, [row(1_000, 'food')])
    expect(shares(s, 'variable')).toEqual([
      ['food', null],
      ['fuel', null],
      ['fun', null],
    ])
  })

  it('shares income, savings and planned bills the same way', () => {
    const s = sheet(
      [cat('pay', 'income', 0), cat('side', 'income', 1), cat('rent', 'bill', 0), cat('phone', 'bill', 1)],
      [row(300_000, 'pay'), row(100_000, 'side'), row(-5_000, 'phone')],
      // Rent counts its planned 1,600.00 (F3): 1,600 of 1,650.
      [{ categoryId: 'rent', plannedCents: 160_000, dueDay: 1 }],
    )
    expect(shares(s, 'income')).toEqual([
      ['pay', 7_500],
      ['side', 2_500],
    ])
    expect(shares(s, 'bill')).toEqual([
      ['rent', 9_697],
      ['phone', 303],
    ])
  })
})

describe('goalBars (F17)', () => {
  const bar = (categoryId: string, budgetCents: number | null, actualCents: number) => ({
    categoryId,
    budgetCents,
    actualCents,
  })

  it('puts every goal and actual on the scale of the largest, half-up', () => {
    // 5,700 of 5,700; 325 of 400; a row with neither. Scale 5,700.00.
    const out = goalBars({ rows: [bar('pay', 570_000, 570_000), bar('side', 40_000, 32_500), bar('gift', null, 0)] })
    expect(out).toEqual({
      scaleCents: 570_000,
      bars: [
        { categoryId: 'pay', goalBp: 10_000, actualBp: 10_000 },
        // 40,000 / 570,000 = 701.75 bp; 32,500 / 570,000 = 570.18 bp.
        { categoryId: 'side', goalBp: 702, actualBp: 570 },
        { categoryId: 'gift', goalBp: null, actualBp: 0 },
      ],
    })
  })

  it('scales to an actual beyond its goal, so the bar runs past its track', () => {
    const out = goalBars({ rows: [bar('pay', 100_000, 150_000)] })
    expect(out.bars).toEqual([{ categoryId: 'pay', goalBp: 6_667, actualBp: 10_000 }])
  })

  it('draws no bar for money back out, and nothing at all with nothing above zero', () => {
    expect(goalBars({ rows: [bar('pay', 50_000, -2_000)] }).bars).toEqual([
      { categoryId: 'pay', goalBp: 10_000, actualBp: null },
    ])
    expect(goalBars({ rows: [bar('pay', 0, 0), bar('side', null, -500)] })).toEqual({
      scaleCents: 0,
      bars: [
        { categoryId: 'pay', goalBp: null, actualBp: null },
        { categoryId: 'side', goalBp: null, actualBp: null },
      ],
    })
  })

  it('refuses a fraction of a cent rather than scale it', () => {
    expect(() => goalBars({ rows: [bar('pay', 10.5, 0)] })).toThrow(RangeError)
  })
})
