import { describe, expect, it } from 'vitest'
import { cents, isoDate } from '@budget/money-primitives'
import { periodSheet, type PeriodCategory, type PeriodEntry, type PeriodPlan } from '../src/period-sheet.js'
import { budgetUsedBp, goalBars, partShares, shareOf, stackedColumns } from '../src/shares.js'

/**
 * Suite tests, worked by hand. The workbook's charts print no number and the
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

describe('shareOf', () => {
  // A budget is never below zero (0008's check), and callers leave out a
  // row below zero; either reaching here is a bug to hear about, not a share.
  it('refuses a part below zero, or a whole that is not above zero', () => {
    expect(() => shareOf(cents(-1), cents(100))).toThrow(RangeError)
    expect(() => shareOf(cents(0), cents(0))).toThrow(RangeError)
    expect(shareOf(cents(0), cents(100))).toBe(0)
  })
})

describe('partShares (F19, the Year pie)', () => {
  const part = (key: string, c: number) => ({ key, cents: c })

  it('gives each part above zero its share of those parts, half-up', () => {
    // Income 6,000 + expenses 3,000 + savings 1,000.01 = 10,000.01 above zero.
    expect(partShares({ parts: [part('in', 600_000), part('out', 300_000), part('saved', 100_001)] })).toEqual({
      wholeCents: 1_000_001,
      parts: [
        { key: 'in', shareBp: 6_000 },
        { key: 'out', shareBp: 3_000 },
        { key: 'saved', shareBp: 1_000 },
      ],
    })
  })

  it('draws nothing at or below zero, and leaves it out of the whole', () => {
    // Savings taken back out (−50.00) is not a slice, and the two left share 100%.
    expect(partShares({ parts: [part('in', 30_000), part('out', 10_000), part('saved', -5_000), part('none', 0)] })).toEqual({
      wholeCents: 40_000,
      parts: [
        { key: 'in', shareBp: 7_500 },
        { key: 'out', shareBp: 2_500 },
        { key: 'saved', shareBp: null },
        { key: 'none', shareBp: null },
      ],
    })
  })

  it('has no share at all when nothing is above zero', () => {
    expect(partShares({ parts: [part('in', 0), part('out', -100)] }).parts.map((p) => p.shareBp)).toEqual([null, null])
  })
})

describe('stackedColumns (F19, the Year stacked column)', () => {
  const col = (key: string, ...parts: number[]) => ({ key, parts })

  it('stacks each column on one scale, the tallest column, with parts that meet exactly', () => {
    // January 300 + 100 = 400 is the tallest; February 100 + 200 = 300.
    const out = stackedColumns({ columns: [col('jan', 30_000, 10_000), col('feb', 10_000, 20_000)] })
    expect(out.scaleCents).toBe(40_000)
    expect(out.columns).toEqual([
      { key: 'jan', parts: [{ fromBp: 0, toBp: 7_500 }, { fromBp: 7_500, toBp: 10_000 }] },
      { key: 'feb', parts: [{ fromBp: 0, toBp: 2_500 }, { fromBp: 2_500, toBp: 7_500 }] },
    ])
    // A third is 3,333.33… bp and rounds down, and the second part starts
    // exactly there: no gap or overlap between them.
    const thirds = stackedColumns({ columns: [col('a', 1, 2)] }).columns[0]!.parts
    expect(thirds).toEqual([{ fromBp: 0, toBp: 3_333 }, { fromBp: 3_333, toBp: 10_000 }])
  })

  it('leaves a part at or below zero undrawn, and out of its column', () => {
    // A refund-only month's expenses (−20.00) are not drawn and do not shorten
    // its income; the scale is the tallest column drawn.
    const out = stackedColumns({ columns: [col('jan', 10_000, -2_000), col('feb', 0, 5_000)] })
    expect(out.scaleCents).toBe(10_000)
    expect(out.columns.map((c) => c.parts)).toEqual([
      [{ fromBp: 0, toBp: 10_000 }, null],
      [null, { fromBp: 0, toBp: 5_000 }],
    ])
  })

  it('draws nothing when no column has anything above zero', () => {
    const out = stackedColumns({ columns: [col('jan', 0, 0), col('feb', -1, 0)] })
    expect(out.scaleCents).toBe(0)
    expect(out.columns.flatMap((c) => c.parts)).toEqual([null, null, null, null])
  })
})

describe('budgetUsedBp (F50, a list\'s % pill)', () => {
  const used = (actualCents: number, budgetCents: number | null) => budgetUsedBp({ actualCents, budgetCents }).usedBp

  it('gives the Actual over the budget in basis points, past 100% uncapped', () => {
    // $348 of $300 is 116%; $900 of $300 is 300%; $150 of $300 is 50%.
    expect(used(34_800, 30_000)).toBe(11_600)
    expect(used(90_000, 30_000)).toBe(30_000)
    expect(used(15_000, 30_000)).toBe(5_000)
  })

  it('rounds half-up to a basis point, as F17 does', () => {
    // 5 of 20,000 cents is 2.5 bp: half-up gives 3 where half-even gives 2.
    expect(used(5, 20_000)).toBe(3)
    // 1 of 30,000 is a third of a basis point, down; 2 of 3 is 6,666.67, up.
    expect(used(1, 30_000)).toBe(0)
    expect(used(2, 3)).toBe(6_667)
    // 20,001 of 20,000 is 10,000.5 bp, up.
    expect(used(20_001, 20_000)).toBe(10_001)
  })

  it('is exact past the largest integer a double multiplies safely', () => {
    // x 10,000 passes 2^53, where a double's rounding, either way, gives one less.
    expect(used(8_323_058_873_777_179, 13_525)).toBe(6_153_832_808_707_711)
  })

  it('gives 0% for nothing spent against a budget', () => {
    expect(used(0, 30_000)).toBe(0)
  })

  it('gives null, no pill, with no budget or a $0 one, never a division by zero', () => {
    expect(used(12_345, null)).toBeNull()
    expect(used(12_345, 0)).toBeNull()
    expect(used(0, 0)).toBeNull()
  })

  it('gives null when refunds took the Actual below zero', () => {
    expect(used(-4_599, 30_000)).toBeNull()
    expect(used(-1, 30_000)).toBeNull()
  })

  it('refuses a negative budget or a fraction of a cent', () => {
    expect(() => used(100, -1)).toThrow(RangeError)
    // Before the refund's null: a bad input is refused whatever the Actual.
    expect(() => used(-5, -1)).toThrow(RangeError)
    expect(() => used(-100.5, 30_000)).toThrow(RangeError)
    expect(() => used(-100, 300.5)).toThrow(RangeError)
  })

  it('refuses a share too large to give exactly, rather than round it', () => {
    // 900,719,925,474 of 1 is 9,007,199,254,740,000 bp, under 2^53: exact.
    expect(used(900_719_925_474, 1)).toBe(9_007_199_254_740_000)
    // 900,719,925,475 of 1 is 9,007,199,254,750,000 bp, past 2^53 - 1: a
    // double would give a nearby number, so it is refused.
    expect(() => used(900_719_925_475, 1)).toThrow(RangeError)
  })
})
