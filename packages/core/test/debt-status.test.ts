import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { amortize } from '../src/debt.js'
import { debtStatus } from '../src/debt-status.js'

/**
 * Hand-derived (Suite, not External): the edges of F22 that the workbook's cached
 * values never reach.
 */
const on = (asOf: string, debts: Parameters<typeof amortize>[0]['debts'], extras: Parameters<typeof amortize>[0]['extraPayments'] = []) =>
  debtStatus({ amortization: amortize({ startDate: '2026-01-01', debts, extraPayments: extras }), asOf: isoDate(asOf) })

// $300.00 at 12% a year (1% a month), $100.00 a month. Month 1 pays with no
// interest: 20,000. Month 2: 200 interest, 20,200 − 10,000 = 10,200. Month
// 3: 102 interest, 10,302 − 10,000 = 302. Month 4: 3.02 → 3 interest, pays
// 305 (D24: the final month is charged), 0.
const loan = { name: 'Loan', startingBalanceCents: 30_000, minimumPaymentCents: 10_000, aprBasisPoints: 1_200 }

describe('debtStatus (F22)', () => {
  it('stands a debt at its starting balance before its start month, nothing paid', () => {
    const d = on('2025-12-31', [loan]).debts[0]!
    expect(d).toMatchObject({ month: null, balanceCents: 30_000, openingBalanceCents: 30_000, paymentCents: 0, paidCents: 0, progressBp: 0 })
  })

  it('reads the month asOf falls in, whatever its day', () => {
    const d = on('2026-03-31', [loan]).debts[0]!
    expect(d).toMatchObject({ month: 3, openingBalanceCents: 10_200, paymentCents: 10_000, balanceCents: 302, paidCents: 29_698 })
    // 29,698 of 30,000 is 9,899.33 bp.
    expect(d.progressBp).toBe(9_899)
  })

  it('charges the final month its interest, and names the month of the last payment (D24)', () => {
    const d = on('2026-04-01', [loan]).debts[0]!
    expect(d).toMatchObject({ month: 4, openingBalanceCents: 302, paymentCents: 305, balanceCents: 0, progressBp: 10_000 })
    expect(d.paidOffIn).toBe('2026-04-01')
  })

  it('stands a debt at 0 after its last payment, with nothing more paid that month', () => {
    const d = on('2027-06-15', [loan]).debts[0]!
    expect(d).toMatchObject({ month: 18, openingBalanceCents: 0, paymentCents: 0, balanceCents: 0, paidCents: 30_000 })
  })

  it("adds the debts into the workbook's summary card, with an extra in its month", () => {
    const car = { name: 'Car', startingBalanceCents: 5_000, minimumPaymentCents: 2_500, aprBasisPoints: 0 }
    const s = on('2026-02-01', [loan, car], [{ debtName: 'Loan', month: 2, amountCents: 1_000 }])
    // Loan month 2: 20,200 − 11,000 = 9,200. Car: 2,500 → 0.
    expect(s.totals).toEqual({
      startingBalanceCents: 35_000,
      openingBalanceCents: 22_500,
      paymentCents: 13_500,
      balanceCents: 9_200,
      paidCents: 25_800,
      progressBp: 7_371,
    })
  })

  it('has no progress with nothing started from, where E20 divides by 0', () => {
    const s = on('2026-01-01', [{ name: 'Done', startingBalanceCents: 0, minimumPaymentCents: 5_000, aprBasisPoints: 0 }])
    expect(s.debts[0]!.progressBp).toBeNull()
    expect(s.totals.progressBp).toBeNull()
  })
})
