import { describe, expect, it } from 'vitest'
import { entriesTotals } from '../src/entries-totals.js'

/**
 * Suite, not External: the workbook has no search, so F52 has no cached
 * value to replay. Worked by hand from invented rows; money out is a
 * negative ledger row (D3).
 */
const groceries = (amountCents: number) => ({ amountCents, kind: 'variable' as const })

describe('entriesTotals (F52)', () => {
  it('adds money out and money in apart, and leaves Not spending out of both', () => {
    // F52's worked example: out 45.20 + 12.75 + 100.00 = 157.95; in 5.00 + 2,500.00 = 2,505.00.
    const entries = [
      groceries(-4_520),
      groceries(-1_275),
      groceries(500),
      { amountCents: 250_000, kind: 'income' as const },
      { amountCents: 50_000, kind: 'transfer' as const },
      { amountCents: -10_000, kind: 'savings' as const },
      groceries(0),
    ]
    expect(entriesTotals({ entries })).toEqual({ spentCents: 15_795, receivedCents: 250_500, count: 7, notSpendingCount: 1 })
  })

  it('never takes a refund off what went out', () => {
    expect(entriesTotals({ entries: [groceries(-2_000), groceries(2_000)] })).toEqual({ spentCents: 2_000, receivedCents: 2_000, count: 2, notSpendingCount: 0 })
  })

  it('counts a card payment and adds nothing for it, either way', () => {
    const entries = [{ amountCents: 50_000, kind: 'transfer' as const }, { amountCents: -50_000, kind: 'transfer' as const }]
    expect(entriesTotals({ entries })).toEqual({ spentCents: 0, receivedCents: 0, count: 2, notSpendingCount: 2 })
  })

  it('gives zeros for no rows, and not -0', () => {
    const totals = entriesTotals({ entries: [] })
    expect(totals).toEqual({ spentCents: 0, receivedCents: 0, count: 0, notSpendingCount: 0 })
    expect(Object.is(totals.spentCents, -0)).toBe(false)
  })

  it('refuses a fraction of a cent', () => {
    expect(() => entriesTotals({ entries: [groceries(-12.5)] })).toThrow(RangeError)
  })
})
