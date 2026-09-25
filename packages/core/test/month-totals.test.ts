import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { monthlyTotals, savingsRate, type MonthlyTotalsInput } from '../src/index.js'

/** Suite tests, worked by hand from F36 (docs/formula-decisions.md). */

const d = isoDate
const row = (postedOn: string, amountCents: number, categoryId: string) => ({ postedOn: d(postedOn), amountCents, categoryId })

/**
 * Thursday 24 September 2026, records from 1 July: July and August are
 * complete, June is before the records. Rent is a planned $1,200.00 on the
 * 1st, charged in July and never in August, so August counts the plan (F3).
 */
const base: MonthlyTotalsInput = {
  asOf: d('2026-09-24'),
  historyStart: d('2026-07-01'),
  readFrom: d('2026-03-01'),
  categories: [
    { id: 'pay', name: 'Pay', kind: 'income', sortOrder: 0 },
    { id: 'fund', name: 'Flight fund', kind: 'savings', sortOrder: 0 },
    { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 0 },
    { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 0 },
    { id: 'card', name: 'Card payment', kind: 'transfer', sortOrder: 0 },
  ],
  planHistory: [{ categoryId: 'rent', effectiveMonth: d('2026-06-01'), plannedCents: 120_000, dueDay: 1 }],
  entries: [
    row('2026-06-15', 420_000, 'pay'),
    row('2026-06-20', -90_000, 'dining'),
    row('2026-07-01', -120_000, 'rent'),
    row('2026-07-05', 420_000, 'pay'),
    row('2026-07-12', -35_000, 'dining'),
    row('2026-07-20', -30_000, 'fund'),
    row('2026-08-05', 420_000, 'pay'),
    row('2026-08-14', -41_000, 'dining'),
    row('2026-08-15', -50_000, 'fund'),
    // A card payment is not spending (F7).
    row('2026-08-28', -99_000, 'card'),
    row('2026-09-05', 420_000, 'pay'),
    row('2026-09-06', -8_000, 'dining'),
  ],
}

describe('monthlyTotals (F36)', () => {
  it('gives each complete month’s Income, Spent and Saved, newest first, planned bills counted as the Month counts them', () => {
    expect(monthlyTotals(base).months).toEqual([
      // $1,200.00 planned rent, never charged, plus $410.00 dining; $500.00 of $4,200.00 saved is 1,190.47… bp.
      { month: '2026-08-01', incomeCents: 420_000, spentCents: 161_000, savedCents: 50_000, savingsRateBp: 1_190 },
      { month: '2026-07-01', incomeCents: 420_000, spentCents: 155_000, savedCents: 30_000, savingsRateBp: 714 },
    ])
  })

  it('leaves out a month before the records start, rather than read it as a quiet one', () => {
    const months = monthlyTotals({ ...base, historyStart: d('2026-07-08') }).months.map((m) => m.month)
    expect(months).toEqual(['2026-08-01'])
  })

  it('leaves out a month that was not read, and the month still running', () => {
    expect(monthlyTotals({ ...base, historyStart: d('2026-06-01'), readFrom: d('2026-07-01') }).months.map((m) => m.month)).toEqual([
      '2026-08-01',
      '2026-07-01',
    ])
  })

  it('has no months at all before any records', () => {
    expect(monthlyTotals({ ...base, historyStart: null }).months).toEqual([])
  })
})

describe('savingsRate (F36)', () => {
  it('is saved over income in basis points, half-up', () => {
    // 50,000 × 10,000 ÷ 420,000 = 1,190.47…; 12,345 of 100,000 is exactly 1,234.5, up to 1,235.
    expect(savingsRate({ incomeCents: 420_000, savedCents: 50_000 })).toEqual({ rateBp: 1_190 })
    expect(savingsRate({ incomeCents: 100_000, savedCents: 12_345 })).toEqual({ rateBp: 1_235 })
  })

  it('keeps the sign when more came out of savings than went in', () => {
    expect(savingsRate({ incomeCents: 100_000, savedCents: -12_345 })).toEqual({ rateBp: -1_235 })
  })

  it('gives none when nothing came in, or only refunds did', () => {
    expect(savingsRate({ incomeCents: 0, savedCents: 5_000 })).toEqual({ rateBp: null })
    expect(savingsRate({ incomeCents: -2_000, savedCents: 5_000 })).toEqual({ rateBp: null })
  })
})
