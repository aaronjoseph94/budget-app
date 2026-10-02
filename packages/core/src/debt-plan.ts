/**
 * The debts as the app keeps them (0014), amortized: each from its own start
 * month, each extra payment against the calendar month it is paid in.
 *
 * The workbook has one Start Date for every debt (Debt Calculator!D6) and types an
 * extra against a schedule row (I26:I494). 0014 keeps a start month per
 * debt and an extra against a month, so a loan taken out later needs no
 * other debt retyped, and an extra paid in March stays in March if a start
 * month moves. This turns them into amortize()'s terms: one schedule per
 * debt, its extras numbered from its own start month. When every debt
 * shares a start month, as all of the sample's do, it is amortize() over them all.
 *
 * The debt-free date is the last month any debt is paid in (B14, EDATE of the
 * start by the most months). A debt whose minimum never clears its interest
 * has no schedule; it is named, and left out of the rest, so the screen can
 * say which one it is instead of showing nothing.
 */
import { type IsoDate, cents, monthsBetween, sumCents } from '@budget/money-primitives'
import { type AmortizeOutput, type DebtSchedule, NeverPaidOff, amortize } from './debt.js'

export interface PlannedDebt {
  readonly name: string
  /** The month the starting balance is as of, named by its first day (0014's start_date). */
  readonly startMonth: IsoDate
  readonly startingBalanceCents: number
  readonly minimumPaymentCents: number
  readonly aprBasisPoints: number
}

export interface DatedExtraPayment {
  readonly debtName: string
  /** The month it is paid in, named by its first day. */
  readonly month: IsoDate
  readonly amountCents: number
}

export interface DebtPlanInput {
  readonly debts: readonly PlannedDebt[]
  readonly extraPayments: readonly DatedExtraPayment[]
}

export interface DebtPlan {
  /** Every debt that is paid off, in the order given; null when none is. */
  readonly amortization: AmortizeOutput | null
  /** The debts whose payment never clears their interest, by name. */
  readonly neverPaidOff: readonly string[]
}

export function debtPlan(input: DebtPlanInput): DebtPlan {
  const schedules: DebtSchedule[] = []
  const neverPaidOff: string[] = []
  const names = new Set(input.debts.map((d) => d.name))
  if (input.extraPayments.some((e) => !names.has(e.debtName))) {
    throw new RangeError('An extra payment names a debt that was not passed in')
  }
  for (const debt of input.debts) {
    const extras = input.extraPayments
      .filter((e) => e.debtName === debt.name)
      .map((e) => ({ debtName: e.debtName, month: scheduleMonth(debt, e.month), amountCents: e.amountCents }))
    try {
      const one = amortize({ startDate: debt.startMonth, debts: [debt], extraPayments: extras })
      schedules.push(...one.perDebt)
    } catch (e) {
      if (!(e instanceof NeverPaidOff)) throw e
      neverPaidOff.push(debt.name)
    }
  }
  if (schedules.length === 0) return { amortization: null, neverPaidOff }
  const paid = input.debts.filter((d) => !neverPaidOff.includes(d.name))
  const lastMonths = schedules.map((s) => s.months[s.months.length - 1]!.date)
  return {
    amortization: {
      startingTotalCents: sumCents(paid.map((d) => cents(d.startingBalanceCents))),
      totalMinimumPaymentCents: sumCents(paid.map((d) => cents(d.minimumPaymentCents))),
      debtFreeDate: lastMonths.reduce((a, b) => (b > a ? b : a)),
      totalInterestCents: sumCents(schedules.map((s) => cents(s.totalInterestCents))),
      perDebt: schedules,
    },
    neverPaidOff,
  }
}

/** amortize()'s month number for a calendar month: the start month is 1. */
function scheduleMonth(debt: PlannedDebt, month: IsoDate): number {
  // 0014's trigger refuses an extra before its debt's start; one here would
  // have no row to go in, and dropping it would move the payoff unsaid.
  if (month < debt.startMonth) throw new RangeError(`An extra payment on "${debt.name}" comes before its start month`)
  return monthsBetween(debt.startMonth, month) + 1
}
