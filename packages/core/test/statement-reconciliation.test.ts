import { describe, expect, it } from 'vitest'
import { cents } from '@budget/money-primitives'
import { reconcileStatement, type StatementSummary } from '../src/statement-reconciliation.js'

/**
 * A statement that adds up, with invented figures.
 *
 * The shape is a real one — previous balance, payments out, purchases in,
 * closing balance — but every number here is made up. A real statement's
 * figures are the account holder's spending and do not belong in a repository.
 *
 *   previous 100000 − payments 30000 + purchases 25500 = new 95500
 */
const SUMMARY: StatementSummary = {
  previousBalanceCents: cents(100_000),
  paymentsAndCreditsCents: cents(30_000),
  purchasesAndDebitsCents: cents(25_500),
  cashAdvancesCents: cents(0),
  feesCents: cents(0),
  interestCents: cents(0),
  newBalanceCents: cents(95_500),
}

/** Statement sign: positive is a purchase, negative is a payment or refund. */
const ROWS = [12_000, 8_500, 5_000, -30_000]

describe('a statement that adds up', () => {
  it('balances', () => {
    const out = reconcileStatement({ amountsCents: ROWS, summary: SUMMARY })
    expect(out.balances).toBe(true)
    expect(out.discrepancies).toEqual([])
    expect(out.rowCount).toBe(4)
  })

  it('reports the parsed totals in the direction the statement prints them', () => {
    const out = reconcileStatement({ amountsCents: ROWS, summary: SUMMARY })
    // Both positive, as a statement prints them — not ledger sign.
    expect(out.parsedPurchasesCents).toBe(25_500)
    expect(out.parsedPaymentsCents).toBe(30_000)
  })

  it('balances a statement with no transactions at all', () => {
    const empty: StatementSummary = {
      previousBalanceCents: cents(0),
      paymentsAndCreditsCents: cents(0),
      purchasesAndDebitsCents: cents(0),
      cashAdvancesCents: cents(0),
      feesCents: cents(0),
      interestCents: cents(0),
      newBalanceCents: cents(0),
    }
    expect(reconcileStatement({ amountsCents: [], summary: empty }).balances).toBe(true)
  })

  it('accounts for fees, interest and cash advances', () => {
    const withCharges: StatementSummary = {
      ...SUMMARY,
      feesCents: cents(1_200),
      interestCents: cents(3_400),
      cashAdvancesCents: cents(10_000),
      newBalanceCents: cents(110_100),
    }
    expect(reconcileStatement({ amountsCents: ROWS, summary: withCharges }).balances).toBe(true)
  })
})

describe('the failures this exists to catch', () => {
  it('catches a row dropped off the bottom of a page', () => {
    // The failure the PDF reader is most likely to produce: a page boundary
    // mishandled, one transaction missing, everything else correct.
    const short = ROWS.filter((a) => a !== 5_000)
    const out = reconcileStatement({ amountsCents: short, summary: SUMMARY })

    expect(out.balances).toBe(false)
    expect(out.discrepancies).toEqual([
      {
        what: 'purchases_and_debits',
        statementCents: 25_500,
        parsedCents: 20_500,
        differenceCents: -5_000,
      },
    ])
  })

  it('catches a payment read as a purchase', () => {
    // A minus sign read as a hyphen, or a column boundary off by a hair.
    // Both totals move, and by twice the amount in opposite directions.
    const flipped = ROWS.map((a) => (a === -30_000 ? 30_000 : a))
    const out = reconcileStatement({ amountsCents: flipped, summary: SUMMARY })

    expect(out.balances).toBe(false)
    expect(out.discrepancies.map((d) => d.what)).toEqual([
      'purchases_and_debits',
      'payments_and_credits',
    ])
    expect(out.discrepancies[0]?.differenceCents).toBe(30_000)
    expect(out.discrepancies[1]?.differenceCents).toBe(-30_000)
  })

  it('catches a duplicated row', () => {
    const doubled = [...ROWS, 12_000]
    const out = reconcileStatement({ amountsCents: doubled, summary: SUMMARY })
    expect(out.discrepancies[0]?.differenceCents).toBe(12_000)
  })

  it('catches a misread summary figure, which the row checks cannot', () => {
    // Both row totals still agree — they are checked against the same wrong
    // number. Only the statement's own equation reveals it.
    const misread: StatementSummary = { ...SUMMARY, newBalanceCents: cents(95_000) }
    const out = reconcileStatement({ amountsCents: ROWS, summary: misread })

    expect(out.balances).toBe(false)
    expect(out.discrepancies).toEqual([
      {
        what: 'balance_equation',
        statementCents: 95_000,
        parsedCents: 95_500,
        differenceCents: 500,
      },
    ])
  })

  it('fails on one cent, because a tolerance is a hole', () => {
    // A cent of slack is rounding today and a missing transaction the day
    // somebody widens it to make an import pass.
    const offByOne = [12_000, 8_500, 4_999, -30_000]
    expect(reconcileStatement({ amountsCents: offByOne, summary: SUMMARY }).balances).toBe(false)
  })

  it('does not let two errors cancel each other into a pass', () => {
    // One purchase too high and another too low by the same amount leaves the
    // total right. The totals cannot catch this and do not pretend to — it is
    // the dedupe hash and the row count that cover it, not this.
    const cancelling = [13_000, 7_500, 5_000, -30_000]
    const out = reconcileStatement({ amountsCents: cancelling, summary: SUMMARY })
    expect(out.balances).toBe(true)
    expect(out.rowCount).toBe(4)
  })
})
