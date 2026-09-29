import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { budgetLeft, explainMonth } from '../src/answer-spending.js'
import { BASE } from './ask-example.js'

/** Suite tests, worked by hand from F48's example (docs/formula-decisions.md). */

const cents = (value: number) => ({ unit: 'cents', value })

describe('explainMonth (F48)', () => {
  it('is the Month’s own sheet: Income, Spent and Saved, and the largest everyday spending', () => {
    expect(explainMonth(BASE, isoDate('2026-08-31'))).toEqual({
      main: {
        say: 'month',
        names: [],
        figures: { month: { unit: 'month', value: '2026-08-01' }, income: cents(300_000), spent: cents(159_700), saved: cents(50_000) },
      },
      rows: [
        { say: 'row', names: ['Groceries'], figures: { amount: cents(8_000) } },
        { say: 'row', names: ['Coffee'], figures: { amount: cents(1_700) } },
      ],
    })
  })

  it('counts a planned bill for the whole month, as the Month does', () => {
    // Rent due on the 28th, not charged yet on the 24th: the Month counts it all the same (F3).
    const planned = {
      ...BASE,
      entries: BASE.entries.filter((e) => e.categoryId !== 'rent'),
      planHistory: [{ categoryId: 'rent', effectiveMonth: isoDate('2026-06-01'), plannedCents: 150_000, dueDay: 28 }],
    }
    expect(explainMonth(planned, isoDate('2026-09-24')).main.figures['spent']).toEqual(cents(159_100))
  })
})

describe('budgetLeft (F48)', () => {
  it('is the Month’s Left for a category this month', () => {
    expect(budgetLeft(BASE, false, ['coffee', 'groceries'])).toEqual({
      main: { say: 'left', names: ['Coffee'], figures: { left: cents(2_900) } },
      rows: [{ say: 'left', names: ['Groceries'], figures: { left: cents(2_000) } }],
    })
  })

  it('is the Variable total’s Left with no category, and says when a budget is overspent', () => {
    expect(budgetLeft(BASE, false, []).main).toEqual({ say: 'left_all', names: [], figures: { left: cents(4_900) } })
    const tight = { ...BASE, budgetHistory: [{ categoryId: 'coffee', month: isoDate('2026-09-01'), applies: 'only' as const, budgetCents: 1_000 }] }
    expect(budgetLeft(tight, false, ['coffee']).main).toEqual({ say: 'over', names: ['Coffee'], figures: { over: cents(100) } })
  })

  it('is the Week’s Left this week, from each weekly budget', () => {
    expect(budgetLeft(BASE, true, ['coffee', 'groceries'])).toEqual({
      main: { say: 'left', names: ['Coffee'], figures: { left: cents(1_000) } },
      rows: [{ say: 'no_budget', names: ['Groceries'], figures: {} }],
    })
  })

  it('gives a bill with no budget typed the Left over its plan, as the Month shows it (F51)', () => {
    // Rent: its 1,500.00 plan stands as its budget, 1,500.00 paid on the 1st: 0.00 left.
    expect(budgetLeft(BASE, false, ['rent']).main).toEqual({ say: 'left', names: ['Rent'], figures: { left: cents(0) } })
    // A bill with no plan and no budget still has none.
    expect(budgetLeft({ ...BASE, planHistory: [] }, false, ['rent']).main).toEqual({ say: 'no_budget', names: ['Rent'], figures: {} })
  })

  it('has nothing to say of pay or savings, which have no Left', () => {
    expect(budgetLeft(BASE, false, ['pay']).main.say).toBe('left_all')
  })
})
