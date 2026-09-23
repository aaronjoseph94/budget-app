/**
 * Where each debt stands on a given day: the Debt Calculator's cards and
 * its summary (F22).
 *
 * EXCEL SEMANTICS — Debt Calculator, read against its cached values:
 *
 *   - H9 `=INDEX(J26:J496, MATCH(EOMONTH(TODAY(),-1)+1, C26:C496))`: the
 *     closing balance of the schedule row for the month `asOf` falls in, so
 *     that month's payment counts as made from its first day. Workbook reads
 *     today; this reads `asOf`, and never a clock.
 *   - I495 `=J18-H9` ("Balance Paid") is the starting balance less that
 *     balance, net of interest. In Workbook it goes below zero for a debt
 *     whose interest outruns its payment; amortize() refuses such a debt,
 *     so here it never does. I496 `=H9` ("Remaining Balance") is the
 *     balance itself.
 *   - E20 `=100%-(B10/D26)` is paid over starting, here in basis points,
 *     half-up (F13, F17). With nothing started from, E20 divides by zero;
 *     here there is no progress.
 *   - D27 `=SUM(J26, O26, …)` is what a month started from: the prior
 *     row's closing balances. E26 `=SUM(I26 …)+SUM(H26 …)` is the month's
 *     payments with extras. The final month's payment includes its
 *     interest (D24), where Workbook's H column shows the prior balance.
 *   - Before a debt's start month MATCH finds no row and Workbook shows #N/A;
 *     here the debt stands at its starting balance, nothing paid. After its
 *     last payment it stands at 0.
 */
import { type Cents, type IsoDate, ZERO_CENTS, cents, monthsBetween, subCents, sumCents } from '@budget/money-primitives'
import type { AmortizeOutput, DebtSchedule } from './debt.js'
import { shareOf } from './shares.js'

export interface DebtStatusInput {
  readonly amortization: AmortizeOutput
  readonly asOf: IsoDate
}

export interface DebtStanding {
  readonly name: string
  /** The schedule month `asOf` falls in, from 1; null before the start month. */
  readonly month: number | null
  /** J18. */
  readonly startingBalanceCents: Cents
  /** What the month started from (the D column's part). */
  readonly openingBalanceCents: Cents
  /** The month's payment, extras in (the E column's part); 0 before the start and after the last. */
  readonly paymentCents: Cents
  /** H9 and I496: the balance at the end of `asOf`'s month. */
  readonly balanceCents: Cents
  /** I495: starting less balance. */
  readonly paidCents: Cents
  /** Paid over starting, in basis points; null for a debt started at 0. */
  readonly progressBp: number | null
  /** The month its last payment is made (Months Until Paid Off, J21, from the start). */
  readonly paidOffIn: IsoDate
}

export interface DebtTotals {
  /** D26. */
  readonly startingBalanceCents: Cents
  /** The D column at `asOf`'s month. */
  readonly openingBalanceCents: Cents
  /** The E column at `asOf`'s month. */
  readonly paymentCents: Cents
  /** B10, Current Debt Total. */
  readonly balanceCents: Cents
  readonly paidCents: Cents
  /** E20, Payoff Progress; null with nothing started from. */
  readonly progressBp: number | null
}

export interface DebtStatus {
  readonly debts: readonly DebtStanding[]
  readonly totals: DebtTotals
}

export function debtStatus(input: DebtStatusInput): DebtStatus {
  const debts = input.amortization.perDebt.map((d) => standing(d, input.asOf))
  const sum = (pick: (d: DebtStanding) => Cents) => sumCents(debts.map(pick))
  const starting = sum((d) => d.startingBalanceCents)
  const balance = sum((d) => d.balanceCents)
  const paid = subCents(starting, balance)
  return {
    debts,
    totals: {
      startingBalanceCents: starting,
      openingBalanceCents: sum((d) => d.openingBalanceCents),
      paymentCents: sum((d) => d.paymentCents),
      balanceCents: balance,
      paidCents: paid,
      progressBp: progressOf(paid, starting),
    },
  }
}

function standing(debt: DebtSchedule, asOf: IsoDate): DebtStanding {
  const starting = cents(debt.startingBalanceCents)
  // amortize() always gives a debt at least its first month.
  const month = monthOf(debt.months[0]!.date, asOf)
  const paidOffIn = debt.months[debt.months.length - 1]!.date
  const at = (opening: Cents, payment: Cents, balance: Cents): DebtStanding => {
    const paid = subCents(starting, balance)
    return {
      name: debt.name,
      month,
      startingBalanceCents: starting,
      openingBalanceCents: opening,
      paymentCents: payment,
      balanceCents: balance,
      paidCents: paid,
      progressBp: progressOf(paid, starting),
      paidOffIn,
    }
  }
  if (month === null) return at(starting, ZERO_CENTS, starting)
  const row = debt.months[month - 1]
  if (row === undefined) return at(ZERO_CENTS, ZERO_CENTS, ZERO_CENTS)
  const opening = month === 1 ? starting : cents(debt.months[month - 2]!.balanceCents)
  return at(opening, cents(row.paymentCents), cents(row.balanceCents))
}

/** The schedule month `asOf` falls in, counting the start month as 1; null before it. */
function monthOf(start: IsoDate, asOf: IsoDate): number | null {
  const from = `${start.slice(0, 7)}-01` as IsoDate
  const to = `${asOf.slice(0, 7)}-01` as IsoDate
  return to < from ? null : monthsBetween(from, to) + 1
}

/** `paid` of `starting` in basis points, half-up; none with nothing started from. */
function progressOf(paid: Cents, starting: Cents): number | null {
  return starting <= 0 ? null : shareOf(paid, starting)
}
