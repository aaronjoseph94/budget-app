import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { goalLevers } from '../src/levers.js'

/**
 * Hand-derived (F34 has no workbook cell): no lever trims a category by more
 * than its usual month.
 *
 * "Your best month" is the usual month less the lowest of the complete
 * months. A month in which a refund was larger than the spending (a return
 * of something bought the month before) has an Actual below zero (D8); for
 * this lever it counts as $0.00, the least a month can spend.
 *
 * Clothes, six complete months, April to September 2026:
 *   spent 200.00 in each of April, May, June, July and September;
 *   August: spent 100.00, and a 600.00 refund for a coat bought in March
 *   -> August's Actual is -500.00.
 *   usual month (median) = 200.00; lowest = -500.00, counted as 0.00
 *   best-month lever = 200.00 - 0.00 = 200.00 a month, never 700.00.
 */
const clothes = { id: 'clothes', name: 'Clothes', kind: 'variable' as const, sortOrder: 0 }
const row = (day: string, cents: number) => ({ postedOn: isoDate(day), amountCents: cents, categoryId: clothes.id })

const input = {
  asOf: isoDate('2026-10-15'),
  historyStart: isoDate('2026-04-01'),
  readFrom: isoDate('2025-10-01'),
  categories: [clothes],
  entries: [
    row('2026-04-12', -20_000),
    row('2026-05-12', -20_000),
    row('2026-06-12', -20_000),
    row('2026-07-12', -20_000),
    row('2026-08-12', -10_000),
    row('2026-08-20', 60_000),
    row('2026-09-12', -20_000),
  ],
  goal: { remainingCents: 1_000_000, unitCostCents: null },
  paceWeeklyCents: 10_000,
}
const monthlyBy = (levers: ReturnType<typeof goalLevers>) => new Map(levers.levers.map((l) => [l.kind, l.monthlyCents]))

describe('goalLevers when one of the months was a net refund', () => {
  const levers = goalLevers(input)

  it('the usual month is $200.00: the quarter lever is $50.00 and the tenth $20.00', () => {
    expect(monthlyBy(levers).get('quarter')).toBe(5_000)
    expect(monthlyBy(levers).get('tenth')).toBe(2_000)
  })

  it('no lever trims a category by more than its usual month', () => {
    for (const l of levers.levers) expect(l.monthlyCents).toBeLessThanOrEqual(20_000)
  })

  it('the best month lever is the whole usual month, $200.00: the refund month counts as $0.00', () => {
    expect(monthlyBy(levers).get('best_month')).toBe(20_000)
  })

  it('a month of spending nothing gives the same lever, and a lowest month above $0.00 is kept as it is', () => {
    // August with no rows at all: lowest 0.00, the lever 200.00.
    const none = goalLevers({ ...input, entries: input.entries.filter((e) => !e.postedOn.startsWith('2026-08')) })
    expect(monthlyBy(none).get('best_month')).toBe(20_000)
    // August at 100.00 spent and no refund: lowest 100.00, the lever 100.00.
    const some = goalLevers({ ...input, entries: input.entries.filter((e) => e.amountCents < 0) })
    expect(monthlyBy(some).get('best_month')).toBe(10_000)
  })
})
