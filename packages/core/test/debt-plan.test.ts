import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import { NeverPaidOff, amortize, type AmortizeInput } from '../src/debt.js'
import { debtPlan, type PlannedDebt } from '../src/debt-plan.js'

const golden = loadGolden<AmortizeInput, { debtFreeDate: string }>('debt-payoff')
const month = (m: string) => isoDate(`${m}-01`)

// Hand-derived, as debt-status.test.ts: $300.00 at 1% a month, $100.00 a
// month from January 2026, paid off in April with $3.05 (D24).
const loan: PlannedDebt = { name: 'Loan', startMonth: month('2026-01'), startingBalanceCents: 30_000, minimumPaymentCents: 10_000, aprBasisPoints: 1_200 }
// $50.00 at 0%, $25.00 a month from June 2026: June and July.
const car: PlannedDebt = { name: 'Car', startMonth: month('2026-06'), startingBalanceCents: 5_000, minimumPaymentCents: 2_500, aprBasisPoints: 0 }

describe('amortize, given what it cannot plan (architecture-a-12)', () => {
  it('refuses no debts, where it gave the debt-free date "-Infinity-NaN-NaN"', () => {
    expect(() => amortize({ startDate: '2025-03-01', debts: [], extraPayments: [] })).toThrow(new RangeError('amortize needs at least one debt'))
  })

  it('refuses an extra payment naming a debt that was not passed in, rather than drop it', () => {
    // $10.00 at 0%, $1.00 a month: paid in ten payments, 9 months after the
    // first (the workbook's count). Ignoring a $9.00 extra in month 1 kept it
    // at 9, where paying $10.00 at once clears it in the first: 0.
    const debts = [{ name: 'A', startingBalanceCents: 1_000, minimumPaymentCents: 100, aprBasisPoints: 0 }]
    expect(() => amortize({ startDate: '2025-03-01', debts, extraPayments: [{ debtName: 'Typo', month: 1, amountCents: 900 }] })).toThrow(
      new RangeError('An extra payment names a debt that was not passed in'),
    )
    expect(amortize({ startDate: '2025-03-01', debts, extraPayments: [{ debtName: 'A', month: 1, amountCents: 900 }] }).perDebt[0]!.monthsToPayoff).toBe(0)
  })
})

describe('debtPlan', () => {
  it('refuses an extra payment naming a debt that was not passed in (architecture-a-12)', () => {
    expect(() => debtPlan({ debts: [loan], extraPayments: [{ debtName: 'Typo', month: month('2026-02'), amountCents: 100 }] })).toThrow(
      new RangeError('An extra payment names a debt that was not passed in'),
    )
  })

  it("is amortize() when every debt shares a start month, as the workbook's debts do", () => {
    const start = isoDate(golden.input.startDate)
    const plan = debtPlan({
      debts: golden.input.debts.map((d) => ({ ...d, startMonth: start })),
      // The workbook's I28, month 3 of a March start, is May.
      extraPayments: [{ debtName: 'Credit Card 1', month: month('2025-05'), amountCents: 5_000 }],
    })
    expect(plan.neverPaidOff).toEqual([])
    expect(plan.amortization).toEqual(amortize(golden.input))
    expect(plan.amortization?.debtFreeDate).toBe(golden.expected.debtFreeDate)
  })

  it('starts each debt in its own month, and numbers its extras from there', () => {
    const plan = debtPlan({ debts: [loan, car], extraPayments: [{ debtName: 'Car', month: month('2026-06'), amountCents: 2_500 }] })
    const [l, c] = plan.amortization!.perDebt
    expect(l!.months.map((m) => m.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'])
    // $25.00 plus the $25.00 extra clears the car in its first month, June.
    expect(c!.months).toEqual([{ month: 1, date: '2026-06-01', interestCents: 0, paymentCents: 5_000, extraCents: 2_500, balanceCents: 0 }])
    expect(plan.amortization).toMatchObject({ startingTotalCents: 35_000, totalMinimumPaymentCents: 12_500, debtFreeDate: '2026-06-01', totalInterestCents: 305 })
  })

  it('names a debt whose payment never clears its interest, and plans the rest', () => {
    // $1,000.00 at 24% (2% a month, $20.00) paying $10.00 grows for ever.
    const card: PlannedDebt = { name: 'Card', startMonth: month('2026-01'), startingBalanceCents: 100_000, minimumPaymentCents: 1_000, aprBasisPoints: 2_400 }
    const plan = debtPlan({ debts: [card, loan], extraPayments: [] })
    expect(plan.neverPaidOff).toEqual(['Card'])
    expect(plan.amortization?.perDebt.map((d) => d.name)).toEqual(['Loan'])
    expect(plan.amortization?.startingTotalCents).toBe(30_000)
    expect(debtPlan({ debts: [card], extraPayments: [] })).toEqual({ amortization: null, neverPaidOff: ['Card'] })
    expect(() => amortize({ startDate: '2026-01-01', debts: [card], extraPayments: [] })).toThrow(NeverPaidOff)
  })

  // Testing fuzz-03: at 60% (5% a month) $1.00 never clears the interest on
  // $1,000.00, and the balance outgrew any amount the app can hold before
  // the 600th month, so debtPlan threw a RangeError and the Debts screen
  // showed no debts at all.
  it('names a debt whose balance would outgrow any amount, and plans the rest', () => {
    const start = month('2025-01')
    const car: PlannedDebt = { name: 'Car', startMonth: start, startingBalanceCents: 1_500_000, minimumPaymentCents: 40_000, aprBasisPoints: 600 }
    const payday: PlannedDebt = { name: 'Payday', startMonth: start, startingBalanceCents: 100_000, minimumPaymentCents: 100, aprBasisPoints: 6_000 }
    const plan = debtPlan({ debts: [car, payday], extraPayments: [] })
    expect(plan.neverPaidOff).toEqual(['Payday'])
    expect(plan.amortization?.perDebt.map((d) => d.name)).toEqual(['Car'])
    // $500.00 at 400% paying $10.00; $10,000.00 at 47% paying $1.00.
    for (const d of [{ ...payday, startingBalanceCents: 50_000, minimumPaymentCents: 1_000, aprBasisPoints: 40_000 }, { ...payday, startingBalanceCents: 1_000_000, aprBasisPoints: 4_700 }]) {
      expect(debtPlan({ debts: [d], extraPayments: [] })).toEqual({ amortization: null, neverPaidOff: ['Payday'] })
    }
  })

  it('still plans a debt that an extra payment clears, however little its minimum', () => {
    // $1,000.00 at 5% a month, $1.00 a month: 999.00 after January; February
    // charges 49.95 (1,048.95), and a $2,000.00 extra pays it all.
    const payday: PlannedDebt = { name: 'Payday', startMonth: month('2025-01'), startingBalanceCents: 100_000, minimumPaymentCents: 100, aprBasisPoints: 6_000 }
    const plan = debtPlan({ debts: [payday], extraPayments: [{ debtName: 'Payday', month: month('2025-02'), amountCents: 200_000 }] })
    expect(plan.neverPaidOff).toEqual([])
    expect(plan.amortization?.perDebt[0]?.months.map((m) => [m.interestCents, m.paymentCents, m.balanceCents])).toEqual([[0, 100, 99_900], [4_995, 104_895, 0]])
  })

  it('has no plan with no debts', () => {
    expect(debtPlan({ debts: [], extraPayments: [] })).toEqual({ amortization: null, neverPaidOff: [] })
  })

  it('refuses an extra before its debt starts, which 0014 refuses too', () => {
    expect(() => debtPlan({ debts: [car], extraPayments: [{ debtName: 'Car', month: month('2026-05'), amountCents: 100 }] })).toThrow(
      /before its start month/,
    )
  })
})
