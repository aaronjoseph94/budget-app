import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { goalLevers, type GoalLeversInput } from '../src/index.js'

/** Suite tests, worked by hand from F34 (docs/formula-decisions.md). */

const d = isoDate
const MONTHS = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
/** One charge a month, in dollars, March to August. */
const monthly = (categoryId: string, dollars: readonly number[]) =>
  dollars.map((amount, i) => ({ postedOn: d(`${MONTHS[i]!}-10`), amountCents: -amount * 100, categoryId }))

/**
 * Thursday 24 September 2026, records from 1 March: six complete months.
 * Dining out's usual month is $405.00 and its lowest $300.00 (F27's example);
 * Groceries' usual is $380.00 every month; Coffee's $8.00. Flight training
 * has $17,350.00 to go at a middle pace of $103.85 a week (F33's example).
 */
const base: GoalLeversInput = {
  asOf: d('2026-09-24'),
  historyStart: d('2026-03-01'),
  readFrom: d('2025-09-01'),
  categories: [
    { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 0 },
    { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 1 },
    { id: 'coffee', name: 'Coffee', kind: 'variable', sortOrder: 2 },
    { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 0 },
  ],
  entries: [
    ...monthly('dining', [300, 420, 360, 510, 390, 450]),
    ...monthly('groceries', [380, 380, 380, 380, 380, 380]),
    ...monthly('coffee', [12, 8, 8, 8, 4, 8]),
    // A bill is not a lever, however large.
    ...monthly('rent', [1_600, 1_600, 1_600, 1_600, 1_600, 1_600]),
  ],
  goal: { remainingCents: 1_735_000, unitCostCents: 27_500 },
  paceWeeklyCents: 10_385,
}

describe('goalLevers (F34)', () => {
  it('works out weeks sooner and the time a month for each lever, largest saving first', () => {
    // Dining out: a tenth $40.50 → $40.00, a quarter $101.25 → $100.00, the
    // best month $105.00. Groceries: a tenth $38.00 → $40.00, a quarter $95.00,
    // no best month. Coffee's quarter $2.00 and best month $4.00 are nothing.
    // Dining's quarter is $23.08 a week: 168 − ⌈17,350.00 ÷ 126.93⌉ = 137, 31 weeks.
    expect(goalLevers(base).levers).toEqual([
      { categoryId: 'dining', kind: 'best_month', monthlyCents: 10_500, weeklyCents: 2_423, weeksSooner: 32, weeksToGoal: null, minutesPerMonth: 23 },
      { categoryId: 'dining', kind: 'quarter', monthlyCents: 10_000, weeklyCents: 2_308, weeksSooner: 31, weeksToGoal: null, minutesPerMonth: 22 },
      { categoryId: 'groceries', kind: 'quarter', monthlyCents: 9_500, weeklyCents: 2_192, weeksSooner: 30, weeksToGoal: null, minutesPerMonth: 21 },
      { categoryId: 'dining', kind: 'tenth', monthlyCents: 4_000, weeklyCents: 923, weeksSooner: 14, weeksToGoal: null, minutesPerMonth: 9 },
      { categoryId: 'groceries', kind: 'tenth', monthlyCents: 4_000, weeklyCents: 923, weeksSooner: 14, weeksToGoal: null, minutesPerMonth: 9 },
    ])
  })

  it('offers two categories, a quarter each, the largest first', () => {
    // Transit's quarter, $25.00, is a lever too, but a third category is not offered.
    const transit = {
      ...base,
      categories: [...base.categories, { id: 'transit', name: 'Transit', kind: 'variable' as const, sortOrder: 3 }],
      entries: [...base.entries, ...monthly('transit', [100, 100, 100, 100, 100, 100])],
    }
    expect(goalLevers(transit).levers.some((l) => l.categoryId === 'transit')).toBe(true)
    expect(goalLevers(transit).offered.map((l) => [l.categoryId, l.kind, l.monthlyCents])).toEqual([
      ['dining', 'quarter', 10_000],
      ['groceries', 'quarter', 9_500],
    ])
  })

  it('offers the best month when the quarter rounds to nothing, and only from $5.00 before rounding', () => {
    // Snacks: usual $9.00, lowest $2.00. A quarter, $2.25, is $0; the best month, $7.00, is $5.00.
    const snacks = { ...base, entries: monthly('coffee', [2, 9, 9, 9, 9, 12]) }
    expect(goalLevers(snacks).offered).toEqual([
      { categoryId: 'coffee', kind: 'best_month', monthlyCents: 500, weeklyCents: 115, weeksSooner: 2, weeksToGoal: null, minutesPerMonth: 1 },
    ])
    // Usual $8.00, lowest $4.00: $4.00 is under $5.00, so no best month even though it rounds to $5.00.
    expect(goalLevers({ ...base, entries: monthly('coffee', [12, 8, 8, 8, 4, 8]) }).levers).toEqual([])
  })

  it('says how long a lever alone takes when there is no pace', () => {
    // ⌈17,350.00 ÷ 23.08⌉ = 752 weeks.
    const offered = goalLevers({ ...base, paceWeeklyCents: null }).offered[0]
    expect(offered).toMatchObject({ kind: 'quarter', weeksSooner: null, weeksToGoal: 752 })
  })

  it('does not offer a lever that brings the date no sooner', () => {
    // $100.00 to go at $103.85 a week is one week, with or without a lever.
    const near = goalLevers({ ...base, goal: { ...base.goal, remainingCents: 10_000 } })
    expect(near.levers.every((l) => l.weeksSooner === 0)).toBe(true)
    expect(near.offered).toEqual([])
  })

  it('gives no time a month for a goal in dollars, and no levers once the target is met', () => {
    const dollars = goalLevers({ ...base, goal: { remainingCents: 1_735_000, unitCostCents: null } })
    expect(dollars.offered.map((l) => l.minutesPerMonth)).toEqual([null, null])
    expect(goalLevers({ ...base, goal: { ...base.goal, remainingCents: 0 } })).toEqual({ levers: [], offered: [] })
  })

  it('needs a complete month: none before the records have one', () => {
    expect(goalLevers({ ...base, historyStart: d('2026-09-01') })).toEqual({ levers: [], offered: [] })
  })
})
