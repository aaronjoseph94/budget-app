import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { starterBudgets, type StarterBudgetsInput } from '../src/index.js'

/** Suite tests, worked by hand from F43's example (docs/formula-decisions.md). */

const d = isoDate
const spent = (categoryId: string, day: string, dollars: number) => ({ postedOn: d(day), amountCents: -Math.round(dollars * 100), categoryId })

/** Sunday 27 September 2026, records from 14 May: June, July and August are complete. */
const base: StarterBudgetsInput = {
  asOf: d('2026-09-27'),
  historyStart: d('2026-05-14'),
  readFrom: d('2026-03-01'),
  categories: [
    { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 0 },
    { id: 'coffee', name: 'Coffee', kind: 'variable', sortOrder: 1 },
    { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 2 },
    { id: 'gifts', name: 'Gifts', kind: 'variable', sortOrder: 3 },
    { id: 'movies', name: 'Movies', kind: 'variable', sortOrder: 4 },
    { id: 'phone', name: 'Phone', kind: 'bill', sortOrder: 0 },
    { id: 'pay', name: 'Pay', kind: 'income', sortOrder: 0 },
    { id: 'card', name: 'Card payments', kind: 'transfer', sortOrder: 0 },
  ],
  entries: [
    // May is before the records' first whole month, so its $900 is never used.
    spent('groceries', '2026-05-20', 900),
    spent('groceries', '2026-06-12', 412.3),
    spent('groceries', '2026-07-12', 389.75),
    spent('groceries', '2026-08-12', 450.1),
    spent('coffee', '2026-07-03', 61.2),
    spent('coffee', '2026-08-03', 73.4),
    spent('dining', '2026-08-20', 180),
    spent('gifts', '2026-07-20', 30),
    spent('gifts', '2026-08-20', 40),
    ...['06', '07', '08'].map((m) => spent('phone', `2026-${m}-02`, 55)),
    { postedOn: d('2026-08-01'), amountCents: 300_000, categoryId: 'pay' },
    spent('card', '2026-08-15', 2_000),
    // This month's charges are not a complete month.
    spent('groceries', '2026-09-05', 1_000),
  ],
  budgetHistory: [
    { categoryId: 'dining', month: d('2026-08-01'), applies: 'onward', budgetCents: 15_000 },
    { categoryId: 'gifts', month: d('2026-09-01'), applies: 'only', budgetCents: null },
  ],
}

describe('starterBudgets (F43)', () => {
  it('offers the median of up to 3 complete months, rounded up to $5, bills first', () => {
    expect(starterBudgets(base)).toEqual({
      completeMonths: 3,
      offers: [
        { categoryId: 'phone', budgetCents: 5_500, months: 3 },
        { categoryId: 'groceries', budgetCents: 41_500, months: 3 },
        { categoryId: 'coffee', budgetCents: 6_500, months: 3 },
      ],
    })
  })

  it('takes only the 3 latest complete months, and halves an even count half-up', () => {
    // Records from 1 April: April's $1,000 is a fourth month back and is not used.
    const longer = { ...base, historyStart: d('2026-04-01'), entries: [...base.entries, spent('phone', '2026-04-02', 1_000)] }
    expect(starterBudgets(longer).offers[0]).toEqual({ categoryId: 'phone', budgetCents: 5_500, months: 3 })
    // Two months, July and August: $61.20 and $73.40 halve to $67.30, rounded up to $70.00.
    const two = { ...base, historyStart: d('2026-07-01') }
    expect(starterBudgets(two).offers.find((o) => o.categoryId === 'coffee')).toEqual({ categoryId: 'coffee', budgetCents: 7_000, months: 2 })
  })

  it('leaves a budget in effect alone, a typed "no budget" included', () => {
    const ids = starterBudgets(base).offers.map((o) => o.categoryId)
    expect(ids).not.toContain('dining')
    expect(ids).not.toContain('gifts')
    // Gifts' "no budget" is for September only; in October it would be offered.
    const october = { ...base, asOf: d('2026-10-02') }
    expect(starterBudgets(october).offers.map((o) => o.categoryId)).toContain('gifts')
  })

  it('offers nothing below $0.01 a month, on a list that takes no budget, or with no complete month', () => {
    const refunded = { ...base, entries: [...base.entries, { postedOn: d('2026-08-25'), amountCents: 50_000, categoryId: 'gifts' }] }
    expect(starterBudgets({ ...refunded, asOf: d('2026-10-02') }).offers.map((o) => o.categoryId)).not.toContain('gifts')
    expect(starterBudgets(base).offers.map((o) => o.categoryId)).not.toContain('movies')
    expect(starterBudgets(base).offers.map((o) => o.categoryId)).not.toContain('pay')
    expect(starterBudgets(base).offers.map((o) => o.categoryId)).not.toContain('card')
    expect(starterBudgets({ ...base, historyStart: d('2026-09-03') })).toEqual({ completeMonths: 0, offers: [] })
    expect(starterBudgets({ ...base, historyStart: null })).toEqual({ completeMonths: 0, offers: [] })
  })

  it('keeps an amount already on $5, and rounds a cent over it up', () => {
    const exact = { ...base, entries: [spent('phone', '2026-08-02', 55.01)], historyStart: d('2026-08-01') }
    expect(starterBudgets(exact).offers).toEqual([{ categoryId: 'phone', budgetCents: 6_000, months: 1 }])
  })
})
