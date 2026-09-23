/**
 * Debt amortization.
 *
 * EXCEL SEMANTICS — Debt Calculator sheet, B26:Y496, verified against the
 * workbook's own cached values:
 *
 *   - Month 1 is the start month itself. Month n falls on startDate + (n-1).
 *   - NO interest accrues in month 1; the payment applies directly to the
 *     starting balance. (J18=13333, H26=150, J26=13183.)
 *   - From month 2, interest accrues on the PRIOR closing balance BEFORE the
 *     payment is subtracted. (13183 x (1+5%/12) - 150 = 13087.92917 = J27.)
 *   - The monthly rate is apr/12 flat, with no day-count adjustment (J20).
 *   - A payment is min(minimum + extra for that month, outstanding balance);
 *     the final month pays only the remainder.
 *   - monthsToPayoff is payoffMonthIndex - 1. The workbook reports 110 (J21)
 *     while the balance reaches zero at month index 111.
 *   - debtFreeDate is EDATE(startDate, max(monthsToPayoff)) across all debts (B14).
 *
 * Each debt pays only its own minimum. The workbook does NOT roll a cleared
 * debt's payment into the next one — Credit Card 1 takes its full 110 months
 * even though the car loan clears at month 15. Snowball and avalanche
 * strategies are a separate capability layered on top, not this function.
 */
import {
  type Cents,
  type IsoDate,
  ZERO_CENTS,
  accrueMonthlyInterest,
  addMonths,
  basisPoints,
  cents,
  isoDate,
  minCents,
  subCents,
  sumCents,
} from '@budget/money-primitives'

/** Guard against a minimum payment that never clears its own interest. */
const MAX_MONTHS = 600

export interface DebtInput {
  readonly name: string
  readonly startingBalanceCents: number
  readonly minimumPaymentCents: number
  readonly aprBasisPoints: number
}

export interface ExtraPaymentInput {
  readonly debtName: string
  readonly month: number
  readonly amountCents: number
}

export interface AmortizeInput {
  readonly startDate: string
  readonly debts: readonly DebtInput[]
  readonly extraPayments: readonly ExtraPaymentInput[]
}

export interface ScheduleMonth {
  readonly month: number
  readonly date: IsoDate
  readonly interestCents: number
  readonly paymentCents: number
  readonly extraCents: number
  readonly balanceCents: number
}

export interface DebtSchedule {
  readonly name: string
  /** J18: the balance as of the start month, before month 1's payment. */
  readonly startingBalanceCents: number
  readonly months: readonly ScheduleMonth[]
  /** Months after the start month. The workbook's J21. */
  readonly monthsToPayoff: number
  /** 1-based index of the month whose closing balance is zero. */
  readonly payoffMonthIndex: number
  readonly totalInterestCents: number
}

export interface AmortizeOutput {
  readonly startingTotalCents: number
  readonly totalMinimumPaymentCents: number
  readonly debtFreeDate: IsoDate
  readonly totalInterestCents: number
  readonly perDebt: readonly DebtSchedule[]
}

export function amortize(input: AmortizeInput): AmortizeOutput {
  const start = isoDate(input.startDate)

  const extrasByDebt = new Map<string, Map<number, Cents>>()
  for (const e of input.extraPayments) {
    const forDebt = extrasByDebt.get(e.debtName) ?? new Map<number, Cents>()
    const existing = forDebt.get(e.month) ?? ZERO_CENTS
    forDebt.set(e.month, cents(existing + cents(e.amountCents)))
    extrasByDebt.set(e.debtName, forDebt)
  }

  const perDebt = input.debts.map((d) => amortizeOne(d, start, extrasByDebt.get(d.name)))

  return {
    startingTotalCents: sumCents(input.debts.map((d) => cents(d.startingBalanceCents))),
    totalMinimumPaymentCents: sumCents(input.debts.map((d) => cents(d.minimumPaymentCents))),
    debtFreeDate: addMonths(start, Math.max(...perDebt.map((d) => d.monthsToPayoff))),
    totalInterestCents: sumCents(perDebt.map((d) => cents(d.totalInterestCents))),
    perDebt,
  }
}

function amortizeOne(
  debt: DebtInput,
  start: IsoDate,
  extras: Map<number, Cents> | undefined,
): DebtSchedule {
  const apr = basisPoints(debt.aprBasisPoints)
  const minimum = cents(debt.minimumPaymentCents)
  let balance = cents(debt.startingBalanceCents)
  let totalInterest = ZERO_CENTS

  const months: ScheduleMonth[] = []

  for (let month = 1; month <= MAX_MONTHS; month++) {
    // Month 1 is payment-only; interest begins in month 2. See EXCEL SEMANTICS.
    const interest = month === 1 ? ZERO_CENTS : accrueMonthlyInterest(balance, apr)
    const afterInterest = cents(balance + interest)
    totalInterest = cents(totalInterest + interest)

    const extra = extras?.get(month) ?? ZERO_CENTS
    const payment = minCents(cents(minimum + extra), afterInterest)
    balance = subCents(afterInterest, payment)

    months.push({
      month,
      date: addMonths(start, month - 1),
      interestCents: interest,
      paymentCents: payment,
      extraCents: extra,
      balanceCents: balance,
    })

    if (balance === 0) {
      return {
        name: debt.name,
        startingBalanceCents: cents(debt.startingBalanceCents),
        months,
        monthsToPayoff: month - 1,
        payoffMonthIndex: month,
        totalInterestCents: totalInterest,
      }
    }
  }

  throw new NeverPaidOff(debt.name, MAX_MONTHS)
}

/**
 * A debt whose minimum never clears its own interest. It names the debt and
 * nothing else: the message can reach a screen, and amounts are never logged.
 */
export class NeverPaidOff extends Error {
  constructor(
    readonly debtName: string,
    months: number,
  ) {
    super(`"${debtName}" is not paid off within ${months} months: its payment never clears its interest.`)
    this.name = 'NeverPaidOff'
  }
}
