import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import { amortize, type AmortizeInput } from '../src/debt.js'
import type { PlannedDebt } from '../src/debt-plan.js'
import { payoffStrategies } from '../src/debt-strategy.js'

/**
 * Hand-derived (Suite, not External): Workbook cannot roll a payment (D2), so
 * no cached value checks these. Each case is worked month by month below.
 */
const month = (m: string) => isoDate(`2026-${m}-01`)
const debt = (name: string, startingBalanceCents: number, minimumPaymentCents: number, aprBasisPoints = 0, startMonth = month('01')): PlannedDebt => ({
  name, startMonth, startingBalanceCents, minimumPaymentCents, aprBasisPoints,
})
const plans = (debts: PlannedDebt[]) => payoffStrategies({ debts, extraPayments: [] })!
const months = (o: { paidOffIn: readonly { name: string; month: string }[] } | null) =>
  Object.fromEntries((o?.paidOffIn ?? []).map((p) => [p.name, p.month.slice(5, 7)]))

describe('payoffStrategies (F23)', () => {
  // Z $100 at 0%; X $600 at 12% (1% a month); Y $300 at 0%; each $100 a
  // month. Month 1 charges no interest: Z clears, X 50,000, Y 20,000.
  // Flat: X 40,500 (500), 30,905 (405), 21,214 (309), 11,426 (212), 1,540
  //   (114), then 15 → pays 1,555 in July. Y clears in March. 1,555 interest.
  // Snowball (Z, Y, X): Feb, Z's $100 clears Y's last 10,000 with X at
  //   40,500. Mar, X 40,905 less 30,000: 10,905. Apr, 109 → 11,014, paid.
  //   500 + 405 + 109 = 1,014.
  // Avalanche (X, then Y and Z by name): Feb, X 40,500 less Z's 10,000:
  //   30,500. Mar, 305 → 30,805 less 20,000: 10,805, Y clears on its own.
  //   Apr, 108 → 10,913, paid. 500 + 305 + 108 = 913.
  const three = [debt('Z', 10_000, 10_000), debt('X', 60_000, 10_000, 1_200), debt('Y', 30_000, 10_000)]

  it('pays only minimums on the flat plan, as Workbook does', () => {
    const { flat } = plans(three)
    expect(flat).toEqual({ debtFreeDate: '2026-07-01', totalInterestCents: 1_555, paidOffIn: expect.any(Array) })
    expect(months(flat)).toEqual({ Z: '01', X: '07', Y: '03' })
  })

  it('rolls into the smallest balance first on the snowball', () => {
    const { snowball } = plans(three)
    expect(snowball).toMatchObject({ debtFreeDate: '2026-04-01', totalInterestCents: 1_014 })
    expect(months(snowball)).toEqual({ Z: '01', X: '04', Y: '02' })
  })

  it('rolls into the highest APR first on the avalanche, ties by name', () => {
    const { avalanche } = plans(three)
    expect(avalanche).toMatchObject({ debtFreeDate: '2026-04-01', totalInterestCents: 913 })
    expect(months(avalanche)).toEqual({ Z: '01', X: '04', Y: '03' })
  })

  it("moves the rest of a clearing debt's payment the same month", () => {
    // A $50 on $100 a month clears in January with $50 over: B 35,000 less
    // 10,000 less 5,000 is 20,000; February 10,000 then A's 10,000 clears it.
    // Were the $50 lost, B would stand at 25,000, then 5,000, and clear in March.
    const s = plans([debt('A', 5_000, 10_000), debt('B', 35_000, 10_000)])
    expect(months(s.snowball)).toEqual({ A: '01', B: '02' })
    expect(months(s.flat)).toEqual({ A: '01', B: '04' })
  })

  it('breaks a tie of balances by name, whatever order they were typed in', () => {
    // Cash $50 on $200 frees 15,000 in January: Alpha 25,000 → 10,000, Beta
    // 25,000. Feb, 20,000 freed: Alpha 5,000 clears, Beta 20,000 → 5,000.
    const s = plans([debt('Beta', 30_000, 5_000), debt('Alpha', 30_000, 5_000), debt('Cash', 5_000, 20_000)])
    expect(months(s.snowball)).toEqual({ Beta: '03', Alpha: '02', Cash: '01' })
    expect(months(s.avalanche)).toEqual({ Beta: '03', Alpha: '02', Cash: '01' })
  })

  it('rolls nothing into a debt before its start month', () => {
    // Loan starts in March: A's freed money in January and February has
    // nowhere to go. March pays 10,000 and A's 10,000: 10,000 left, cleared
    // in April. Rolled into early, it would stand at 15,000 by March and
    // clear then.
    const s = plans([debt('A', 5_000, 10_000), debt('Loan', 30_000, 10_000, 0, month('03'))])
    expect(months(s.snowball)).toEqual({ A: '01', Loan: '04' })
    expect(months(s.flat)).toEqual({ A: '01', Loan: '05' })
  })

  it('counts an extra in its month, and rolls what its debt does not need', () => {
    const s = payoffStrategies({
      debts: [debt('A', 5_000, 10_000), debt('B', 40_000, 10_000)],
      extraPayments: [{ debtName: 'A', month: month('01'), amountCents: 10_000 }],
    })!
    // A's $200 clears $50; B takes 10,000 and 15,000 in January, 15,000
    // left; February 10,000 and A's 10,000 clear it. Without the extra's
    // 10,000 over, B would stand at 25,000, then 5,000, and clear in March.
    expect(months(s.snowball)).toEqual({ A: '01', B: '02' })
  })

  it('rolls an extra typed on a debt already paid off', () => {
    // A clears in January with 5,000 over: B 55,000 → 40,000. February: A's
    // 10,000 and its 30,000 extra roll with B's own 10,000, 50,000 in all,
    // which clears B. Rolling A's minimum alone would leave 20,000.
    const s = payoffStrategies({
      debts: [debt('A', 5_000, 10_000), debt('B', 55_000, 10_000)],
      extraPayments: [{ debtName: 'A', month: month('02'), amountCents: 30_000 }],
    })!
    expect(months(s.snowball)).toEqual({ A: '01', B: '02' })
  })

  it("gives the golden debt-free date on the flat plan, which is Workbook's", () => {
    const golden = loadGolden<AmortizeInput, { debtFreeDate: string }>('debt-payoff')
    const start = isoDate(golden.input.startDate)
    const s = payoffStrategies({
      debts: golden.input.debts.map((d) => ({ ...d, startMonth: start })),
      extraPayments: [{ debtName: 'Credit Card 1', month: isoDate('2025-05-01'), amountCents: 5_000 }],
    })!
    expect(s.flat?.debtFreeDate).toBe(golden.expected.debtFreeDate)
    expect(s.flat?.totalInterestCents).toBe(amortize(golden.input).totalInterestCents)
    expect(s.snowball!.debtFreeDate < s.flat!.debtFreeDate).toBe(true)
    expect(s.avalanche!.totalInterestCents <= s.snowball!.totalInterestCents).toBe(true)
  })

  it('has no plan with no debts, and no outcome for one that never pays off', () => {
    expect(payoffStrategies({ debts: [], extraPayments: [] })).toBeNull()
    const s = plans([debt('Card', 100_000, 1_000, 2_400)])
    expect(s).toEqual({ flat: null, snowball: null, avalanche: null })
  })
})
