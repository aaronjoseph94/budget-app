import { describe, it, expect } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { amortize } from '../../src/debt.js'
import type { AmortizeInput } from '../../src/debt.js'

interface Expected {
  startingTotalCents: number
  totalMinimumPaymentCents: number
  debtFreeDate: string
  perDebt: { name: string; monthsToPayoff: number; payoffMonthIndex: number }[]
  maxScheduleDivergenceCents: number
}
interface Schedules {
  schedules: Record<string, { month: number; extraCents: number; balanceCentsFromExcel: number }[]>
}

const golden = loadGolden<AmortizeInput, Expected, Schedules>('debt-payoff')

describe('debt amortization replays the workbook', () => {
  const actual = amortize(golden.input)
  const e = golden.expected

  it('reproduces the starting total', () => {
    expect(actual.startingTotalCents).toBe(e.startingTotalCents)
  })

  it('reproduces the total of minimum payments', () => {
    expect(actual.totalMinimumPaymentCents).toBe(e.totalMinimumPaymentCents)
  })

  it('reproduces the debt-free date', () => {
    expect(actual.debtFreeDate).toBe(e.debtFreeDate)
  })

  it.each(golden.expected.perDebt)(
    'reproduces months to payoff for $name',
    ({ name, monthsToPayoff, payoffMonthIndex }) => {
      const d = actual.perDebt.find((x) => x.name === name)
      expect(d, `no schedule produced for ${name}`).toBeDefined()
      expect(d!.monthsToPayoff).toBe(monthsToPayoff)
      expect(d!.payoffMonthIndex).toBe(payoffMonthIndex)
    },
  )

  /**
   * Excel keeps sub-cent fractions; this engine rounds to whole cents each
   * month. That is a deliberate divergence (docs/divergences.md), so the
   * schedule is checked against a hard BOUND that must not grow — not a
   * tolerance. If our rounding ever gets worse, this fails.
   */
  it('stays within the recorded divergence bound on every schedule row', () => {
    let worst = 0
    let worstAt = ''
    for (const [name, rows] of Object.entries(golden.schedules)) {
      const produced = actual.perDebt.find((x) => x.name === name)
      expect(produced, `no schedule produced for ${name}`).toBeDefined()
      for (const row of rows) {
        const ours = produced!.months.find((m) => m.month === row.month)
        expect(ours, `${name} month ${row.month} missing`).toBeDefined()
        const diff = Math.abs(ours!.balanceCents - row.balanceCentsFromExcel)
        if (diff > worst) {
          worst = diff
          worstAt = `${name} month ${row.month}`
        }
      }
    }
    expect(worst, `worst divergence at ${worstAt}`).toBeLessThanOrEqual(
      e.maxScheduleDivergenceCents,
    )
  })

  it('pays every debt to exactly zero', () => {
    for (const d of actual.perDebt) {
      const final = d.months[d.months.length - 1]
      expect(final?.balanceCents, `${d.name} did not reach zero`).toBe(0)
    }
  })
})
