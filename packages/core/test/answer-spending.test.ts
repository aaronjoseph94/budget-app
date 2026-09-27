import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { compareIn, spendIn } from '../src/answer-spending.js'
import { BASE } from './ask-example.js'

/** Suite tests, worked by hand from F48's example (docs/formula-decisions.md). */

const d = isoDate
const AUGUST = { from: d('2026-08-01'), to: d('2026-08-31') }
const SEPTEMBER = { from: d('2026-09-01'), to: d('2026-09-24') }
const AUGUST_SAME_DAYS = { from: d('2026-08-01'), to: d('2026-08-24') }
const cents = (value: number) => ({ unit: 'cents', value })

describe('spendIn (F48)', () => {
  it('adds up a category over the days asked about', () => {
    expect(spendIn(BASE, AUGUST, ['coffee'])).toEqual({ say: 'spent_in', names: ['Coffee'], figures: { amount: cents(1_700) } })
    expect(spendIn(BASE, SEPTEMBER, ['coffee'])).toEqual({ say: 'spent_in', names: ['Coffee'], figures: { amount: cents(1_100) } })
  })

  it('counts a category net of its refunds', () => {
    expect(spendIn(BASE, SEPTEMBER, ['groceries']).figures).toEqual({ amount: cents(8_000) })
  })

  it('adds up several categories, and all spending when none is named, leaving out card payments', () => {
    expect(spendIn(BASE, SEPTEMBER, ['coffee', 'groceries'])).toEqual({ say: 'spent_in', names: ['Coffee', 'Groceries'], figures: { amount: cents(9_100) } })
    // Rent's charge replaces its plan (D5); the $900.00 card payment is not spending.
    expect(spendIn(BASE, SEPTEMBER, [])).toEqual({ say: 'spent_all', names: [], figures: { amount: cents(159_100) } })
  })

  it('counts a planned bill on its due day only', () => {
    const planned = { ...BASE, entries: BASE.entries.filter((e) => e.categoryId !== 'rent') }
    expect(spendIn(planned, { from: d('2026-09-02'), to: d('2026-09-24') }, ['rent']).figures).toEqual({ amount: cents(0) })
    expect(spendIn(planned, SEPTEMBER, ['rent']).figures).toEqual({ amount: cents(150_000) })
  })

  it('counts a window across a month end month by month', () => {
    expect(spendIn(BASE, { from: d('2026-08-20'), to: d('2026-09-05') }, ['coffee', 'rent']).figures).toEqual({ amount: cents(151_750) })
  })

  it('says pay received and money saved, and never adds them to spending', () => {
    expect(spendIn(BASE, AUGUST, ['pay'])).toEqual({ say: 'received_in', names: ['Paycheck'], figures: { amount: cents(300_000) } })
    expect(spendIn(BASE, AUGUST, ['fund'])).toEqual({ say: 'saved_in', names: ['Flight fund'], figures: { amount: cents(50_000) } })
    expect(spendIn(BASE, AUGUST, ['coffee', 'pay'])).toEqual({ say: 'spent_in', names: ['Coffee'], figures: { amount: cents(1_700) } })
  })

  it('refuses a category that was not passed in', () => {
    expect(() => spendIn(BASE, AUGUST, ['nope'])).toThrow(RangeError)
  })
})

describe('compareIn (F48, F25, F26)', () => {
  it('sets the days asked about against the days before, with the change and its direction word', () => {
    expect(compareIn(BASE, SEPTEMBER, AUGUST_SAME_DAYS, ['coffee'])).toEqual({
      say: 'compared',
      names: ['Coffee'],
      figures: { now: cents(1_100), before: cents(1_000), change: { unit: 'change', value: 100, direction: 'more' } },
    })
    expect(compareIn(BASE, SEPTEMBER, AUGUST_SAME_DAYS, []).figures['change']).toEqual({ unit: 'change', value: 100, direction: 'more' })
    expect(compareIn(BASE, SEPTEMBER, AUGUST_SAME_DAYS, []).say).toBe('compared_all')
  })

  it('calls a change under $1.00 the same', () => {
    expect(compareIn(BASE, AUGUST_SAME_DAYS, { from: d('2026-09-01'), to: d('2026-09-24') }, ['groceries']).figures['change']).toEqual({
      unit: 'change',
      value: 0,
      direction: 'same',
    })
  })

  it('says there is nothing to compare with when the days before start before the records', () => {
    expect(compareIn(BASE, SEPTEMBER, null, ['coffee'])).toEqual({ say: 'not_compared', names: ['Coffee'], figures: { amount: cents(1_100) } })
  })
})
