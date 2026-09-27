import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { gridLevel, spendingGrid, type HabitsInput } from '../src/index.js'

/** Suite tests, worked by hand from F40 (docs/formula-decisions.md). Thursday 24 September 2026. */

const d = isoDate
const CATEGORIES: HabitsInput['categories'] = [
  { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 1, weeklyBudgetCents: 7_000 },
  { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 2, weeklyBudgetCents: 14_000 },
  { id: 'coffee', name: 'Coffee', kind: 'variable', sortOrder: 3, weeklyBudgetCents: null },
  { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 4, weeklyBudgetCents: 50_000 },
]
const spend = (date: string, cents: number, categoryId = 'dining') => ({ postedOn: d(date), amountCents: -cents, categoryId })
const habits = (over: Partial<HabitsInput> = {}): HabitsInput => ({
  asOf: d('2026-09-24'),
  historyStart: d('2026-02-01'),
  readFrom: d('2025-09-01'),
  categories: CATEGORIES,
  entries: [],
  ...over,
})
const dayOf = (grid: ReturnType<typeof spendingGrid>, date: string) => grid.weeks.flatMap((w) => w.days).find((x) => x.date === date)!

describe('gridLevel (F40)', () => {
  it('gives each boundary to the lower level, against an allowance of $30.00', () => {
    const at = (spentCents: number) => gridLevel({ spentCents, allowanceCents: 3_000 })
    expect([at(-500), at(0), at(1), at(1_500), at(1_501), at(3_000), at(3_001), at(4_500), at(4_501)]).toEqual([
      'none',
      'none',
      'half',
      'half',
      'all',
      'all',
      'one_and_half',
      'one_and_half',
      'more',
    ])
  })

  it('reads any spending as more against $0, and a day with none as none', () => {
    expect(gridLevel({ spentCents: 1, allowanceCents: 0 })).toBe('more')
    expect(gridLevel({ spentCents: 0, allowanceCents: 0 })).toBe('none')
  })
})

describe('spendingGrid (F40)', () => {
  it('draws 26 weeks to this one, days after today to come, with the budgets over seven as the allowance', () => {
    const grid = spendingGrid(habits())
    expect(grid.weeks).toHaveLength(26)
    expect(grid.weeks[0]!.start).toBe('2026-03-30')
    expect(grid.weeks[25]!.start).toBe('2026-09-21')
    expect(grid.allowance).toEqual({ cents: 3_000, from: 'budgets' })
    expect(dayOf(grid, '2026-09-24')).toEqual({ date: '2026-09-24', status: 'recorded', spentCents: 0, level: 'none' })
    expect(dayOf(grid, '2026-09-25')).toEqual({ date: '2026-09-25', status: 'to_come', spentCents: null, level: null })
    // 26 weeks less the three days to come.
    expect(grid.recordedDays).toBe(179)
    expect(grid.noSpendDays).toBe(179)
  })

  it('nets a day of Variable rows, leaves bills out, and levels it', () => {
    const grid = spendingGrid(
      habits({
        entries: [
          spend('2026-09-14', 1_500),
          spend('2026-09-15', 1_000),
          spend('2026-09-15', 501, 'coffee'),
          spend('2026-09-16', 4_600),
          spend('2026-09-16', -200, 'groceries'),
          spend('2026-09-17', 90_000, 'rent'),
          spend('2026-09-18', -700),
        ],
      }),
    )
    expect(dayOf(grid, '2026-09-14')).toMatchObject({ spentCents: 1_500, level: 'half' })
    expect(dayOf(grid, '2026-09-15')).toMatchObject({ spentCents: 1_501, level: 'all' })
    expect(dayOf(grid, '2026-09-16')).toMatchObject({ spentCents: 4_400, level: 'one_and_half' })
    expect(dayOf(grid, '2026-09-17')).toMatchObject({ spentCents: 0, level: 'none' })
    expect(dayOf(grid, '2026-09-18')).toMatchObject({ spentCents: -700, level: 'none' })
    const week = grid.weeks.find((w) => w.start === '2026-09-14')!
    expect(week).toMatchObject({ spentCents: 6_701, noSpendDays: 4 })
    expect(grid.levels).toEqual({ none: 176, half: 1, all: 1, one_and_half: 1, more: 0 })
  })

  it('starts at the records, a day before them no records, never $0', () => {
    const grid = spendingGrid(habits({ historyStart: d('2026-08-08') }))
    expect(grid.weeks).toHaveLength(8)
    expect(grid.weeks[0]!.start).toBe('2026-08-03')
    expect(dayOf(grid, '2026-08-07')).toEqual({ date: '2026-08-07', status: 'no_records', spentCents: null, level: null })
    expect(dayOf(grid, '2026-08-08').status).toBe('recorded')
    expect(grid.weeks[0]!.spentCents).toBe(0)
    // 8 weeks, less 5 days before the records and 3 to come.
    expect(grid.recordedDays).toBe(48)
  })

  it('reads a day before what was read as no records too', () => {
    const grid = spendingGrid(habits({ readFrom: d('2026-09-01') }))
    expect(grid.weeks[0]!.start).toBe('2026-08-31')
    expect(dayOf(grid, '2026-08-31').status).toBe('no_records')
  })

  it('rounds the budgets over seven half-up, and counts a $0 budget', () => {
    const one = (weeklyBudgetCents: number | null) => [{ ...CATEGORIES[0]!, weeklyBudgetCents }, { ...CATEGORIES[2]! }]
    expect(spendingGrid(habits({ categories: one(10_000) })).allowance).toEqual({ cents: 1_429, from: 'budgets' })
    expect(spendingGrid(habits({ categories: one(0) })).allowance).toEqual({ cents: 0, from: 'budgets' })
  })

  it('with no budget, takes the median day that had spending', () => {
    const categories = [{ ...CATEGORIES[0]!, weeklyBudgetCents: null }, CATEGORIES[3]!]
    const entries = [spend('2026-09-01', 1_200), spend('2026-09-02', 3_000), spend('2026-09-03', 800), spend('2026-09-04', 5_000)]
    expect(spendingGrid(habits({ categories, entries })).allowance).toEqual({ cents: 2_100, from: 'usual_day' })
    expect(spendingGrid(habits({ categories })).allowance).toEqual({ cents: null, from: 'none' })
  })

  it('has no weeks with no records, and refuses a row naming a category it was not given', () => {
    expect(spendingGrid(habits({ historyStart: null })).weeks).toEqual([])
    expect(() => spendingGrid(habits({ entries: [spend('2026-09-01', 100, 'nowhere')] }))).toThrow(RangeError)
  })
})
