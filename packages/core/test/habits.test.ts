import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { gridLevel, spendingGrid, streaks, weekdayPattern, type HabitsInput } from '../src/index.js'

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

describe('weekdayPattern (F40)', () => {
  // Records from Monday 24 August: four complete weeks, 24 August to 20 September.
  const four = habits({
    historyStart: d('2026-08-24'),
    entries: [
      spend('2026-08-24', 1_000),
      spend('2026-08-29', 4_000),
      spend('2026-09-01', 10),
      spend('2026-09-02', -10, 'groceries'),
      spend('2026-09-12', 2_500),
      spend('2026-09-19', 3_600, 'coffee'),
      spend('2026-09-19', 60_000, 'rent'),
      // This week is not complete.
      spend('2026-09-22', 10_000),
    ],
  })

  it('averages each weekday over the complete weeks, half-up, and names the costliest', () => {
    const pattern = weekdayPattern(four)
    if (pattern.status !== 'ready') throw new Error('expected a pattern')
    expect(pattern).toMatchObject({ weeks: 4, from: '2026-08-24', to: '2026-09-20', costliest: 6, allowanceCents: 3_000 })
    // Saturdays $40 + $0 + $25 + $36 = $101 ÷ 4; Tuesday 10¢ ÷ 4 = 2.5¢, Wednesday's refund −2.5¢, each half-up on its size.
    expect(pattern.days.map((x) => x.averageCents)).toEqual([250, 3, -3, 0, 0, 2_525, 0])
    expect(pattern.days.map((x) => x.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('draws each average over a track as long as the budgets\' allowance, and none below $0', () => {
    const pattern = weekdayPattern(four)
    if (pattern.status !== 'ready') throw new Error('expected a pattern')
    // On a scale of $30.00: $25.25 is 8,416.7 bp, $2.50 833.3, 3¢ 10.
    expect(pattern.days.map((x) => x.barBp)).toEqual([833, 10, null, 0, 0, 8_417, 0])
    expect(pattern.days.every((x) => x.trackBp === 10_000)).toBe(true)
  })

  it('draws no track with no weekly budget, the largest average the scale', () => {
    const pattern = weekdayPattern({ ...four, categories: CATEGORIES.map((c) => ({ ...c, weeklyBudgetCents: null })) })
    if (pattern.status !== 'ready') throw new Error('expected a pattern')
    expect(pattern.allowanceCents).toBeNull()
    expect(pattern.days[5]).toMatchObject({ barBp: 10_000, trackBp: null })
  })

  it('reads the last 12 complete weeks at most', () => {
    const pattern = weekdayPattern(habits({ entries: [spend('2026-06-27', 5_000), spend('2026-06-29', 1_200)] }))
    if (pattern.status !== 'ready') throw new Error('expected a pattern')
    expect(pattern).toMatchObject({ weeks: 12, from: '2026-06-29', to: '2026-09-20', costliest: 1 })
    expect(pattern.days[0]!.averageCents).toBe(100)
    expect(pattern.days[5]!.averageCents).toBe(0)
  })

  it('names the earlier weekday on a tie, and none when nothing was spent', () => {
    const tie = weekdayPattern({ ...four, entries: [spend('2026-09-15', 400), spend('2026-09-17', 400)] })
    expect(tie).toMatchObject({ status: 'ready', costliest: 2 })
    expect(weekdayPattern({ ...four, entries: [] })).toMatchObject({ status: 'ready', costliest: null })
  })

  it('needs 4 complete weeks, and names the Monday it becomes possible', () => {
    // Tuesday 1 September: the first whole week is 7 September; 7 and 14 September are complete.
    expect(weekdayPattern(habits({ historyStart: d('2026-09-01') }))).toEqual({ status: 'not_enough', weeks: 2, possibleFrom: '2026-10-05' })
    // A whole week of records from this Monday: complete from 28 September, four by 19 October.
    expect(weekdayPattern(habits({ historyStart: d('2026-09-21') }))).toEqual({ status: 'not_enough', weeks: 0, possibleFrom: '2026-10-19' })
    expect(weekdayPattern(habits({ historyStart: null }))).toEqual({ status: 'not_enough', weeks: 0, possibleFrom: null })
  })
})

describe('streaks (F40)', () => {
  // Records from Monday 10 August: six complete weeks, 10 August to 20 September, against $210.00 a week.
  const weeks = habits({
    historyStart: d('2026-08-10'),
    entries: [
      spend('2026-08-10', 5_000),
      spend('2026-08-12', 90_000, 'rent'),
      spend('2026-09-01', 21_500),
      spend('2026-09-14', 7_000),
      spend('2026-09-15', 13_600, 'groceries'),
      spend('2026-09-16', 400, 'coffee'),
      spend('2026-09-22', 50_000),
    ],
  })

  it('keeps a week whose Left to spend is $0 or more, and counts the run to the last complete week', () => {
    expect(streaks(weeks)).toEqual({
      status: 'ready',
      weeks: [
        { start: '2026-08-10', leftCents: 16_000, kept: true },
        { start: '2026-08-17', leftCents: 21_000, kept: true },
        { start: '2026-08-24', leftCents: 21_000, kept: true },
        { start: '2026-08-31', leftCents: -500, kept: false },
        { start: '2026-09-07', leftCents: 21_000, kept: true },
        // $70 + $136 + $4 of Coffee, which has no budget and still takes its $4 off: exactly $0 left.
        { start: '2026-09-14', leftCents: 0, kept: true },
      ],
      current: 2,
      best: 3,
      bestEnded: '2026-08-24',
    })
  })

  it('breaks the current run on a week over, and names the latest of two equal best runs', () => {
    const over = streaks({ ...weeks, entries: [...weeks.entries, spend('2026-09-20', 1)] })
    expect(over).toMatchObject({ current: 0, best: 3, bestEnded: '2026-08-24' })
    const level = streaks({ ...weeks, entries: [...weeks.entries, spend('2026-08-25', 30_000)] })
    expect(level).toMatchObject({ current: 2, best: 2, bestEnded: '2026-09-14' })
  })

  it('has nothing to keep without a Variable weekly budget, and no run without a complete week', () => {
    const categories = CATEGORIES.map((c) => (c.kind === 'variable' ? { ...c, weeklyBudgetCents: null } : c))
    expect(streaks({ ...weeks, categories })).toEqual({ status: 'no_budget' })
    expect(streaks(habits({ historyStart: d('2026-09-22') }))).toEqual({ status: 'ready', weeks: [], current: 0, best: 0, bestEnded: null })
  })
})
