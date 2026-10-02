import { describe, expect, it } from 'vitest'
import { cents, isoDate } from '@budget/money-primitives'
import { budgetStanding, categoryPace } from '../src/index.js'

/** Suite tests, worked by hand from F28 (docs/formula-decisions.md). */

const d = isoDate
const c = cents
const september = { month: d('2026-09-01'), budgetCents: c(40_000) }

describe('categoryPace (F28)', () => {
  it('scales the month so far to the whole month from day 7, with how far over budget that goes', () => {
    // F28's worked example: $360.00 × 30 ÷ 24 = $450.00, $50.00 over; the
    // notable line is max($25.00, 15% of $400.00) = $60.00, so not notable.
    expect(categoryPace({ ...september, asOf: d('2026-09-24'), actualCents: c(36_000) })).toEqual({
      paceCents: 45_000, overCents: 5_000, notable: false,
    })
    // $400.00 × 30 ÷ 24 = $500.00: $100.00 over, past the $60.00 line.
    expect(categoryPace({ ...september, asOf: d('2026-09-24'), actualCents: c(40_000) })).toEqual({
      paceCents: 50_000, overCents: 10_000, notable: true,
    })
  })

  it('starts on day 7 and not before', () => {
    expect(categoryPace({ ...september, asOf: d('2026-09-07'), actualCents: c(7_000) }).paceCents).toBe(30_000)
    expect(categoryPace({ ...september, asOf: d('2026-09-06'), actualCents: c(7_000) })).toEqual({
      paceCents: null, overCents: null, notable: false,
    })
  })

  it('has no pace for a month that is not the one running', () => {
    expect(categoryPace({ ...september, month: d('2026-08-01'), asOf: d('2026-09-24'), actualCents: c(7_000) }).paceCents).toBeNull()
    expect(categoryPace({ ...september, month: d('2026-10-01'), asOf: d('2026-09-24'), actualCents: c(0) }).paceCents).toBeNull()
  })

  it('rounds half-up on the size, keeping a refund’s sign, in a month of its own length', () => {
    // 1 × 30 ÷ 12 = 2.5 → 3; −1 → −3. February 2027 has 28 days: 1,016 × 28 ÷ 9 = 3,160.9 → 3,161.
    expect(categoryPace({ ...september, asOf: d('2026-09-12'), actualCents: c(1) }).paceCents).toBe(3)
    expect(categoryPace({ ...september, asOf: d('2026-09-12'), actualCents: c(-1) }).paceCents).toBe(-3)
    expect(categoryPace({ month: d('2027-02-01'), budgetCents: null, asOf: d('2027-02-09'), actualCents: c(1_016) }).paceCents).toBe(3_161)
  })

  it('is over by nothing with no budget, a $0 budget, or a pace under the budget', () => {
    const at = { month: september.month, asOf: d('2026-09-24'), actualCents: c(36_000) }
    expect(categoryPace({ ...at, budgetCents: null }).overCents).toBeNull()
    expect(categoryPace({ ...at, budgetCents: c(0) }).overCents).toBeNull()
    expect(categoryPace({ ...at, budgetCents: c(45_000) }).overCents).toBeNull()
  })
})

describe('budgetStanding (F28)', () => {
  it('is near from 90% of the budget up to it, with what is left', () => {
    expect(budgetStanding({ actualCents: c(36_000), budgetCents: c(40_000) })).toEqual({ standing: 'near', overCents: null, leftCents: 4_000, notable: true })
    expect(budgetStanding({ actualCents: c(40_000), budgetCents: c(40_000) })).toEqual({ standing: 'near', overCents: null, leftCents: 0, notable: true })
    expect(budgetStanding({ actualCents: c(35_999), budgetCents: c(40_000) })).toEqual({ standing: 'under', overCents: null, leftCents: 4_001, notable: false })
  })

  it('is over above the budget, notable from $1.00', () => {
    expect(budgetStanding({ actualCents: c(43_000), budgetCents: c(40_000) })).toEqual({ standing: 'over', overCents: 3_000, leftCents: null, notable: true })
    expect(budgetStanding({ actualCents: c(40_099), budgetCents: c(40_000) })).toEqual({ standing: 'over', overCents: 99, leftCents: null, notable: false })
    expect(budgetStanding({ actualCents: c(40_100), budgetCents: c(40_000) }).notable).toBe(true)
  })

  it('is none without a budget above $0', () => {
    const none = { standing: 'none', overCents: null, leftCents: null, notable: false }
    expect(budgetStanding({ actualCents: c(500), budgetCents: null })).toEqual(none)
    expect(budgetStanding({ actualCents: c(500), budgetCents: c(0) })).toEqual(none)
  })
})

describe('categoryPace, at the notable line (architecture-a-05)', () => {
  // The 15th of a 30-day month, a $100.00 budget: the line is max($25.00,
  // 15% = $15.00) = $25.00. $62.50 so far paces to $125.00, $25.00 over:
  // notable. $62.49 paces to $124.98, $24.98 over: not.
  it('is notable exactly at max($25, 15% of the budget), and not a cent under', () => {
    const at = { month: d('2026-09-01'), asOf: d('2026-09-15'), budgetCents: c(10_000) }
    expect(categoryPace({ ...at, actualCents: c(6_250) })).toEqual({ paceCents: 12_500, overCents: 2_500, notable: true })
    expect(categoryPace({ ...at, actualCents: c(6_249) })).toEqual({ paceCents: 12_498, overCents: 2_498, notable: false })
  })
})

