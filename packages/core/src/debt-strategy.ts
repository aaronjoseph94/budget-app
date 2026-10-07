/**
 * Snowball and avalanche: the payoff plans the workbook cannot make (D2, F23).
 *
 * The workbook pays each debt only its own minimum, for its whole life (amortize,
 * the "flat" plan here). Its Hidden Debt ACCELERATOR (CL:DH) was meant to
 * roll a cleared debt's payment into the next and never worked: every cell
 * is 0 or FALSE. So nothing here has a cached value; the tests are
 * hand-derived, and the one tie to the workbook is that the flat plan gives
 * the golden debt-free date.
 *
 * Every month pays out what the started debts' minimums and that month's
 * extras add up to. What a debt does not need (all of it, once cleared, and
 * the rest of a payment larger than its last balance) goes the same month
 * to the first debt still owed in the plan's order: snowball, the smallest
 * starting balance first; avalanche, the highest APR first; ties by name.
 * The order is set once, from what was typed. The rest is amortize()'s: no
 * interest in a debt's first month, interest half-up to the cent (D1), the
 * final month charged (D24), and a debt that has not started takes nothing.
 */
import {
  type Cents,
  type IsoDate,
  ZERO_CENTS,
  accrueMonthlyInterest,
  addCents,
  addMonths,
  basisPoints,
  cents,
  minCents,
  monthsBetween,
  subCents,
} from '@budget/money-primitives'
import type { DebtPlanInput, PlannedDebt } from './debt-plan.js'
import { MAX_MONTHS } from './debt.js'

export type PayoffStrategy = 'flat' | 'snowball' | 'avalanche'

export interface StrategyOutcome {
  /** The month the last debt is paid off in. */
  readonly debtFreeDate: IsoDate
  readonly totalInterestCents: Cents
  /** Each debt's last month, in the order given. */
  readonly paidOffIn: readonly { readonly name: string; readonly month: IsoDate }[]
}

/** Each plan's outcome; null for one that does not pay every debt off within 600 months. */
export type PayoffStrategies = Readonly<Record<PayoffStrategy, StrategyOutcome | null>>

export function payoffStrategies(input: DebtPlanInput): PayoffStrategies | null {
  if (input.debts.length === 0) return null
  return {
    flat: payOff(input, null),
    snowball: payOff(input, [...input.debts].sort((a, b) => a.startingBalanceCents - b.startingBalanceCents || byName(a, b))),
    avalanche: payOff(input, [...input.debts].sort((a, b) => b.aprBasisPoints - a.aprBasisPoints || byName(a, b))),
  }
}

/** By name, in code-point order, so the same names order the same on every device. */
function byName(a: PlannedDebt, b: PlannedDebt): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/** One plan, month by month; `order` is where freed money goes, or null to keep it (flat). */
function payOff(input: DebtPlanInput, order: readonly PlannedDebt[] | null): StrategyOutcome | null {
  const first = input.debts.map((d) => d.startMonth).reduce((a, b) => (b < a ? b : a))
  const balance = new Map(input.debts.map((d) => [d, cents(d.startingBalanceCents)]))
  const paidOffIn = new Map<PlannedDebt, IsoDate>()
  let interest = ZERO_CENTS
  const settle = (d: PlannedDebt, left: Cents, month: IsoDate) => {
    balance.set(d, left)
    if (left === 0) paidOffIn.set(d, month)
  }

  // amortize()'s guard, counted from the first debt's start.
  for (let step = 0; step < MAX_MONTHS; step++) {
    const month = addMonths(first, step)
    // As amortize(): owing more than every minimum and extra left could pay,
    // with interest only adding, no plan pays it all; said before a balance
    // outgrows any amount the app can hold (testing fuzz-03).
    const owing = input.debts.reduce((sum, d) => (paidOffIn.has(d) ? sum : sum + balance.get(d)!), 0)
    const left =
      input.debts.reduce((sum, d) => sum + d.minimumPaymentCents, 0) * (MAX_MONTHS - step) +
      input.extraPayments.reduce((sum, e) => (e.month >= month ? sum + e.amountCents : sum), 0)
    if (owing > left) return null
    let freed = ZERO_CENTS
    for (const d of input.debts) {
      if (d.startMonth > month) continue
      const extra = input.extraPayments
        .filter((e) => e.debtName === d.name && e.month === month)
        .reduce((sum, e) => addCents(sum, cents(e.amountCents)), ZERO_CENTS)
      const budget = addCents(cents(d.minimumPaymentCents), extra)
      if (paidOffIn.has(d)) {
        freed = addCents(freed, budget)
        continue
      }
      const owed = balance.get(d)!
      const charged = monthsBetween(d.startMonth, month) === 0 ? ZERO_CENTS : accrueMonthlyInterest(owed, basisPoints(d.aprBasisPoints))
      interest = addCents(interest, charged)
      const due = addCents(owed, charged)
      const paid = minCents(budget, due)
      freed = addCents(freed, subCents(budget, paid))
      settle(d, subCents(due, paid), month)
    }
    for (const d of order ?? []) {
      if (d.startMonth > month || paidOffIn.has(d) || freed === 0) continue
      const paid = minCents(freed, balance.get(d)!)
      freed = subCents(freed, paid)
      settle(d, subCents(balance.get(d)!, paid), month)
    }
    if (paidOffIn.size === input.debts.length) {
      return {
        debtFreeDate: [...paidOffIn.values()].reduce((a, b) => (b > a ? b : a)),
        totalInterestCents: interest,
        paidOffIn: input.debts.map((d) => ({ name: d.name, month: paidOffIn.get(d)! })),
      }
    }
  }
  return null
}
