import { describe, expect, it } from 'vitest'
import { safeToSpend } from '../src/index.js'
import { PAY, example, on } from './forecast-example.js'

/** Suite tests, worked by hand from F31 (docs/formula-decisions.md). */

describe('safeToSpend (F31)', () => {
  it('shares what is left over the days left, today included, rounded down', () => {
    // 2,000.00 + 2,100.00 + 2,100.00 − 2,180.00 − 300.00 − 200.00 = 3,520.00,
    // over 30 − 24 + 1 = 7 days: 50,285.71 cents, so $502.85.
    expect(safeToSpend(example)).toEqual({ status: 'ok', availableCents: 352_000, days: 7, perDayCents: 50_285, payNotCounted: [] })
  })

  it('counts today alone on the last day of the month', () => {
    // No payday left: 2,000.00 + 2,100.00 − 2,180.00 − 300.00 − 200.00 = 1,420.00.
    expect(safeToSpend(on('2026-09-30'))).toMatchObject({ days: 1, perDayCents: 142_000 })
  })

  it('says nothing is left, never a figure below zero, at $0 or less', () => {
    // A start of −1,520.05 leaves −0.05; one of −1,520.00 leaves exactly nothing.
    expect(safeToSpend({ ...example, startingBalanceCents: -152_005 })).toMatchObject({ status: 'nothing_left', availableCents: -5, perDayCents: 0 })
    expect(safeToSpend({ ...example, startingBalanceCents: -152_000 })).toMatchObject({ status: 'nothing_left', perDayCents: 0 })
  })

  it('gives none without a typed start (D17)', () => {
    expect(safeToSpend({ ...example, startingBalanceCents: null })).toEqual({ status: 'no_start', availableCents: null, days: 7, perDayCents: null, payNotCounted: [] })
  })

  it('names pay it cannot count, since the figure is then lower than it will be', () => {
    // 3,520.00 − 2,100.00 = 1,420.00 over 7 days: 20,285.71 cents.
    expect(safeToSpend({ ...example, paySchedules: [] })).toMatchObject({ perDayCents: 20_285, payNotCounted: [PAY] })
  })
})
