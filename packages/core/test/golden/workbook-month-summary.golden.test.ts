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
 * a cached value from the workbook. The month tabs give Spent over
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

describe("the summary card replays the workbook's Spent and Left to spend (workbook-month-summary)", () => {
  const shared = {
    categories: golden.input.categories,
    entries: golden.input.entries.map((e) => ({ ...e, postedOn: isoDate(e.postedOn) })),
    statementPeriodEnds: [],
    startingBalanceCents: null,
  }
  for (const c of golden.expected) {
    const sheet =
      c.asOf === undefined
        ? periodSheet({ ...shared, budgets: c.budgets, plans: golden.input.plans, from: isoDate(c.from!), to: isoDate(c.to!) })
        : monthSheet({
            ...shared,
            // What is typed on a month tab is that tab's alone. Each asOf is
            // the tab's first day, which names its month.
            budgetHistory: c.budgets.map((b) => ({ ...b, month: isoDate(c.asOf!), applies: 'only' as const })),
            // The workbook's one Monthly Amount serves every tab, so each has it from its own month.
            planHistory: golden.input.plans.map((p) => ({ ...p, effectiveMonth: isoDate(c.asOf!) })),
            asOf: isoDate(c.asOf),
          })
    it.each(c.cells)(`${c.window} → $cell = $cents`, (cell) => {
      expect(sheet.summary[cell.field]).toBe(cell.cents)
    })
  }
})
