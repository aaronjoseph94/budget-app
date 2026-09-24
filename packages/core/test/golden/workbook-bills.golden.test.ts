import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import { billsTotals, type BillsCategory, type BillsTotals, type PlanHistoryRow } from '../../src/plans.js'

/**
 * External check: the total tiles under the workbook's Bills, Debts and
 * Subscriptions cards, each a cached value from the workbook, reached from
 * the typed Monthly Amounts as history (D13) in the first and last month tabs
 * that read them. Then the one tile the app deliberately does not copy.
 */

interface Cell {
  cell: string
  field: keyof BillsTotals
  cents: number
}
interface Case {
  month: string
  window: string
  cells: Cell[]
}
interface Input {
  categories: BillsCategory[]
  planHistory: (Omit<PlanHistoryRow, 'effectiveMonth'> & { effectiveMonth: string })[]
}
interface Departure {
  cell: string
  field: keyof BillsTotals
  cachedCents: number
  divergence: string
}

const golden = loadGolden<Input, Case[], { departures: Departure[] }>('workbook-bills')
const planHistory = golden.input.planHistory.map((p) => ({ ...p, effectiveMonth: isoDate(p.effectiveMonth) }))
const totalsIn = (month: string) => billsTotals({ month: isoDate(month), categories: golden.input.categories, planHistory })

describe("Setup's totals replay the workbook's Bills tiles (workbook-bills)", () => {
  for (const c of golden.expected) {
    const totals = totalsIn(c.month)
    it.each(c.cells)(`${c.window} → $cell = $cents`, (cell) => {
      expect(totals[cell.field]).toBe(cell.cents)
    })
  }
})

describe('the all-fixed total departs from Bills!H36 on purpose (D7)', () => {
  it('adds the subscriptions that H36 drops by summing the empty G46', () => {
    const h36 = golden.departures.find((d) => d.cell === 'Bills!H36')
    expect(h36?.divergence).toBe('D7')
    const totals = totalsIn('2026-01-01')
    // D32 + H32 + L32 as cached: 800 + 50 + 17.99, where the workbook shows 850.
    expect(totals.allFixedCents).toBe(80_000 + 5_000 + 1_799)
    expect(totals.allFixedCents).not.toBe(h36?.cachedCents)
  })
})
