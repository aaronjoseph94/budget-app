import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import {
  monthSheet,
  periodSheet,
  type PeriodBudget,
  type PeriodCategory,
  type PeriodEntry,
  type PeriodPlan,
  type PeriodSheet,
} from '../../src/period-sheet.js'

/**
 * External check: the summary card's Spent (F7) and Left to spend (F5), each
 * a cached value from the Workbook workbook. The month tabs give Spent over
 * planned bills and the one 2026 log row; Weekly Budget and Paycheck Budget,
 * whose windows hold real spending, give Spent and Left to spend with a real
 * Actual subtracted.
 */

interface Cell {
  cell: string
  field: keyof PeriodSheet['summary']
  cents: number
}
interface Case {
  window: string
  asOf?: string
  from?: string
  to?: string
  budgets: PeriodBudget[]
  cells: Cell[]
}
interface Input {
  categories: PeriodCategory[]
  plans: PeriodPlan[]
  entries: (Omit<PeriodEntry, 'postedOn'> & { postedOn: string })[]
}

const golden = loadGolden<Input, Case[]>('workbook-month-summary')

describe("the summary card replays Workbook's Spent and Left to spend (workbook-month-summary)", () => {
  const shared = {
    categories: golden.input.categories,
    plans: golden.input.plans,
    entries: golden.input.entries.map((e) => ({ ...e, postedOn: isoDate(e.postedOn) })),
    statementPeriodEnds: [],
  }
  for (const c of golden.expected) {
    const sheet =
      c.asOf === undefined
        ? periodSheet({ ...shared, budgets: c.budgets, from: isoDate(c.from!), to: isoDate(c.to!) })
        : monthSheet({ ...shared, budgets: c.budgets, asOf: isoDate(c.asOf) })
    it.each(c.cells)(`${c.window} → $cell = $cents`, (cell) => {
      expect(sheet.summary[cell.field]).toBe(cell.cents)
    })
  }
})
