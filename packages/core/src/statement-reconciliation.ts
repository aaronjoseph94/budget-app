/**
 * Does an imported statement add up to what the statement itself says?
 *
 * A credit card statement carries its own arithmetic. It prints the previous
 * balance, the total of payments and credits, the total of new purchases and
 * debits, and the closing balance — and those figures were produced by the
 * bank, not by this app. So a parsed statement can be checked against the
 * bank's own totals before a single row reaches the ledger.
 *
 * This is the safety net the PDF reader is designed around. That reader
 * declines what it cannot do and is deliberately narrow, but the failure worth
 * ruling out is not refusal — it is a misread that looks fine: one row lost off
 * the bottom of a page, a column boundary that shifted, a minus sign read as a
 * hyphen. Every one of those changes a total, and a total that no longer
 * matches the bank's is proof the import is wrong.
 *
 * Arithmetic lives here rather than in the parser because invariant 1 admits no
 * exceptions, and because a parser that can compute a total will eventually be
 * asked to trust its own.
 */
import { type Cents, ZERO_CENTS, cents, sumCents } from '@budget/money-primitives'

/**
 * The figures a statement prints about itself.
 *
 * All are given as the STATEMENT writes them: `paymentsAndCreditsCents` and
 * `purchasesAndDebitsCents` are both positive totals, because that is how a
 * statement presents them. The sign convention of the ledger is applied to
 * rows elsewhere; mixing the two here is how a reconciliation passes by
 * cancelling its own error.
 */
export interface StatementSummary {
  readonly previousBalanceCents: Cents
  readonly paymentsAndCreditsCents: Cents
  readonly purchasesAndDebitsCents: Cents
  readonly cashAdvancesCents: Cents
  readonly feesCents: Cents
  readonly interestCents: Cents
  readonly newBalanceCents: Cents
}

export interface ReconcileInput {
  /**
   * Parsed amounts in STATEMENT sign: positive is a purchase, negative is a
   * payment or refund. Not ledger sign — see the note above.
   */
  readonly amountsCents: readonly number[]
  readonly summary: StatementSummary
}

/** A single named disagreement, with both figures, so a reader can see which. */
export interface Discrepancy {
  readonly what: 'purchases_and_debits' | 'payments_and_credits' | 'balance_equation'
  readonly statementCents: Cents
  readonly parsedCents: Cents
  /** parsed − statement. Zero never appears here. */
  readonly differenceCents: Cents
}

export interface Reconciliation {
  readonly balances: boolean
  readonly discrepancies: readonly Discrepancy[]
  readonly parsedPurchasesCents: Cents
  readonly parsedPaymentsCents: Cents
  readonly rowCount: number
}

/**
 * Check parsed rows against the statement's own totals.
 *
 * Three independent checks, all of which must hold:
 *
 *   1. The parsed positive amounts equal the printed purchases and debits.
 *   2. The parsed negative amounts equal the printed payments and credits.
 *   3. The statement's own balance equation closes:
 *        previous − payments + purchases + advances + fees + interest = new
 *
 * The third does not involve the parsed rows at all. It is here because it
 * catches the case the other two cannot: a summary figure that was itself
 * misread. Two checks against a wrong number agree with each other.
 *
 * Exact equality, never a tolerance. A cent of slack is a row of £0.01
 * rounding today and a missing transaction the day the slack is widened.
 */
export function reconcileStatement(input: ReconcileInput): Reconciliation {
  const amounts = input.amountsCents.map((value) => cents(value))
  const positive = amounts.filter((a) => a > 0)
  const negative = amounts.filter((a) => a < 0)

  const parsedPurchases = positive.length === 0 ? ZERO_CENTS : sumCents(positive)
  // Negated so it is comparable with the statement's own positive total.
  const parsedPaymentsSigned = negative.length === 0 ? ZERO_CENTS : sumCents(negative)
  const parsedPayments = cents(-parsedPaymentsSigned)

  const s = input.summary
  const discrepancies: Discrepancy[] = []

  if (parsedPurchases !== s.purchasesAndDebitsCents) {
    discrepancies.push({
      what: 'purchases_and_debits',
      statementCents: s.purchasesAndDebitsCents,
      parsedCents: parsedPurchases,
      differenceCents: cents(parsedPurchases - s.purchasesAndDebitsCents),
    })
  }

  if (parsedPayments !== s.paymentsAndCreditsCents) {
    discrepancies.push({
      what: 'payments_and_credits',
      statementCents: s.paymentsAndCreditsCents,
      parsedCents: parsedPayments,
      differenceCents: cents(parsedPayments - s.paymentsAndCreditsCents),
    })
  }

  const closing = cents(
    s.previousBalanceCents -
      s.paymentsAndCreditsCents +
      s.purchasesAndDebitsCents +
      s.cashAdvancesCents +
      s.feesCents +
      s.interestCents,
  )
  if (closing !== s.newBalanceCents) {
    discrepancies.push({
      what: 'balance_equation',
      statementCents: s.newBalanceCents,
      parsedCents: closing,
      differenceCents: cents(closing - s.newBalanceCents),
    })
  }

  return {
    balances: discrepancies.length === 0,
    discrepancies,
    parsedPurchasesCents: parsedPurchases,
    parsedPaymentsCents: parsedPayments,
    rowCount: amounts.length,
  }
}
