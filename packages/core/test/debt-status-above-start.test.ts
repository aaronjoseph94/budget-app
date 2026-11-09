import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { debtBalanceChange } from '../src/compare.js'
import { debtPlan } from '../src/debt-plan.js'
import { debtStatus } from '../src/debt-status.js'

/**
 * Hand-derived (Suite, not External): a debt whose balance stands above
 * where it started still has a standing (F22).
 *
 * A minimum below the monthly interest, with a lump sum typed for a later
 * month that clears it: debtPlan gives the debt a schedule, because the
 * extra pays it off, and its balance sits above the starting balance until
 * the lump sum lands. Paid is then below zero, as the workbook's I495 is, and
 * progress is 0: nothing net has been paid off.
 *
 * $1,000.00 at 24% a year (2% a month), $10.00 a month, $2,000.00 extra in
 * month 12 (2026-12).
 *   month 1 (Jan): no interest, pays 10.00            -> 990.00
 *   month 2 (Feb): 19.80 interest, pays 10.00         -> 999.80
 *   month 3 (Mar): 20.00 interest (19.996 half-up), pays 10.00 -> 1,009.80
 * On 2026-03-15 the balance is $1,009.80, $9.80 more than it started at.
 */
const card = { name: 'Card', startMonth: isoDate('2026-01-01'), startingBalanceCents: 100_000, minimumPaymentCents: 1_000, aprBasisPoints: 2_400 }
const input = {
  debts: [card],
  extraPayments: [{ debtName: 'Card', month: isoDate('2026-12-01'), amountCents: 200_000 }],
}
const march = isoDate('2026-03-15')

describe('debtStatus on a debt that grows before a typed lump sum clears it', () => {
  it('the plan itself is fine: the debt is paid off, nothing is "never paid off"', () => {
    const plan = debtPlan(input)
    expect(plan.neverPaidOff).toEqual([])
    expect(plan.amortization?.perDebt[0]?.months[2]?.balanceCents).toBe(100_980)
    expect(plan.amortization?.debtFreeDate).toBe('2026-12-01')
  })

  it('stands it at its balance, with paid below zero and no progress', () => {
    const status = debtStatus({ amortization: debtPlan(input).amortization!, asOf: march })
    expect(status.debts[0]).toMatchObject({ month: 3, balanceCents: 100_980, paidCents: -980, progressBp: 0 })
    expect(status.totals).toMatchObject({ startingBalanceCents: 100_000, balanceCents: 100_980, paidCents: -980, progressBp: 0 })
  })

  it('keeps the progress of a debt beside it, and of the total while that is still above zero', () => {
    // Car: $500.00 at 0%, $100.00 a month: March's is the third payment, so 200.00 left, 300.00 paid, 6,000 bp.
    const car = { name: 'Car', startMonth: isoDate('2026-01-01'), startingBalanceCents: 50_000, minimumPaymentCents: 10_000, aprBasisPoints: 0 }
    const status = debtStatus({ amortization: debtPlan({ ...input, debts: [card, car] }).amortization!, asOf: march })
    expect(status.debts.map((d) => d.progressBp)).toEqual([0, 6_000])
    // 1,500.00 started from, 1,209.80 owed: 290.20 paid, 1,934.67 bp.
    expect(status.totals).toMatchObject({ balanceCents: 120_980, paidCents: 29_020, progressBp: 1_935 })
  })

  it('compares its balance with a month ago: 999.80 at the end of February, 1,009.80 now', () => {
    const vs = debtBalanceChange({ amortization: debtPlan(input).amortization!, asOf: march })
    expect(vs.total).toMatchObject({ nowCents: 100_980, beforeCents: 99_980, changeCents: 1_000, direction: 'more', meaning: 'watch' })
  })
})
