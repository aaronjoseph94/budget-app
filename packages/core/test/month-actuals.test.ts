import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { monthActuals } from '../src/month-actuals.js'

/** Suite tests, worked by hand: each month's Actual as the Month shows it (F33, F34). */

const d = isoDate
const row = (postedOn: string, amountCents: number, categoryId: string) => ({ postedOn: d(postedOn), amountCents, categoryId })
const categories = [
  { id: 'dining', name: 'Dining out', kind: 'variable' as const, sortOrder: 0 },
  { id: 'fund', name: 'Flight fund', kind: 'savings' as const, sortOrder: 0 },
  { id: 'rent', name: 'Rent', kind: 'bill' as const, sortOrder: 0 },
]
const entries = [
  row('2026-07-31', -4_000, 'dining'),
  row('2026-08-01', -2_500, 'dining'),
  row('2026-08-20', 500, 'dining'),
  row('2026-08-15', -30_000, 'fund'),
  row('2026-08-25', 5_000, 'fund'),
  row('2026-09-01', -1_000, 'dining'),
]

describe('monthActuals', () => {
  it('gives each category its Actual in each whole month: spent or moved in, less what came back', () => {
    const [august, july] = monthActuals({ categories, entries, months: [d('2026-08-01'), d('2026-07-01')] }).months
    // August: $25.00 spent less a $5.00 refund; $300.00 moved into the fund less $50.00 taken out.
    expect(august).toEqual({ month: '2026-08-01', actuals: new Map([['dining', 2_000], ['fund', 25_000], ['rent', 0]]) })
    expect(july?.actuals.get('dining')).toBe(4_000)
  })

  it('counts no planned bill, only what was really paid', () => {
    expect(monthActuals({ categories, entries, months: [d('2026-08-01')] }).months[0]?.actuals.get('rent')).toBe(0)
  })

  it('refuses a row naming a category it was not given, rather than leave it out of every month', () => {
    expect(() => monthActuals({ categories: categories.slice(1), entries, months: [d('2026-08-01')] })).toThrow(RangeError)
  })
})
