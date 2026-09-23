import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import { amortize, type AmortizeInput } from '../../src/debt.js'
import { debtStatus } from '../../src/debt-status.js'

/**
 * External check: the Debt Calculator's month totals (E26, E28, D27), and
 * each debt's balance at an explicit day, read by the schedule's month
 * index and never through H9's TODAY() (F22). None of these cells is in a
 * debt's final month, so D24's charged interest leaves every one as cached.
 */

interface Status {
  status: {
    payments: { cell: string; asOf: string; month: number; paymentCents: number }[]
    openingBalances: { cell: string; asOf: string; month: number; openingBalanceCents: number }[]
    balancesAt: { asOf: string; month: number }
  }
  schedules: Record<string, { month: number; balanceCentsFromExcel: number }[]>
}

const golden = loadGolden<AmortizeInput, { maxScheduleDivergenceCents: number }, Status>('debt-payoff')
const amortization = amortize(golden.input)
const statusOn = (asOf: string) => debtStatus({ amortization, asOf: isoDate(asOf) })

describe("debtStatus replays the Debt Calculator's month totals", () => {
  it.each(golden.status.payments)('$cell: month $month pays $paymentCents cents, extras in', (c) => {
    const s = statusOn(c.asOf)
    expect(s.debts.map((d) => d.month)).toEqual([c.month, c.month, c.month, c.month])
    expect(s.totals.paymentCents).toBe(c.paymentCents)
  })

  it.each(golden.status.openingBalances)('$cell: month $month starts from $openingBalanceCents cents', (c) => {
    expect(statusOn(c.asOf).totals.openingBalanceCents).toBe(c.openingBalanceCents)
  })
})

describe('debtStatus reads a balance by its month, never by today', () => {
  const { asOf, month } = golden.status.balancesAt
  const s = statusOn(asOf)

  it.each(Object.entries(golden.schedules))('%s at month 19 is its schedule row, within D1 of the workbook', (name, rows) => {
    const d = s.debts.find((x) => x.name === name)
    const ours = amortization.perDebt.find((x) => x.name === name)!
    const row = rows.find((r) => r.month === month)
    // Paid off before month 19: its last row is 0, and so is its balance.
    const excel = row === undefined ? rows[rows.length - 1]!.balanceCentsFromExcel : row.balanceCentsFromExcel
    const expected = row === undefined ? 0 : ours.months[month - 1]!.balanceCents
    expect(d?.balanceCents).toBe(expected)
    expect(Math.abs(expected - excel)).toBeLessThanOrEqual(golden.expected.maxScheduleDivergenceCents)
  })

  it("gives month 19's progress from the workbook's own rows", () => {
    // J44 + O44 from the schedule rows: 1,135,631 + 55,722 of 2,173,300
    // starting, so 981,947 paid: 0.45182... is 4,518 bp. The engine's rows
    // (55,724, D1) give the same basis point.
    expect(s.totals.startingBalanceCents).toBe(2_173_300)
    expect(s.totals.progressBp).toBe(4_518)
  })
})
