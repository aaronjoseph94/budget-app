import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import {
  monthSheet,
  periodSheet,
  type PeriodCategory,
  type PeriodEntry,
  type PeriodPlan,
  type PeriodSheet,
} from '../../src/period-sheet.js'

/**
 * External check: every expected number is a cached value from the Workbook
 * workbook. Part 1 is Weekly Budget and Paycheck Budget, whose windows run
 * over the Transactions sample (plan §5.5 (a)). Part 2 is the bill and debt
 * blocks over the Bills log and monthly amounts: a pay period, Paycheck's
 * "Actual This Month", and the only 2026 log row (§5.5 (b), (c)).
 */

type Block = keyof PeriodSheet['blocks']
interface Cell {
  cell: string
  block: Block
  /** Null asserts the block's total rather than one row. */
  categoryId: string | null
  actualCents: number
}
interface Case {
  window: string
  from: string
  to: string
  cells: Cell[]
}
interface Input {
  categories: PeriodCategory[]
  entries: (Omit<PeriodEntry, 'postedOn'> & { postedOn: string })[]
}

const golden = loadGolden<Input, Case[]>('workbook-period-part1')

function actualOf(sheet: PeriodSheet, cell: Cell): number {
  const block = sheet.blocks[cell.block]
  if (cell.categoryId === null) return block.actualTotalCents
  const row = block.rows.find((r) => r.categoryId === cell.categoryId)
  expect(row, `${cell.cell}: no row for ${cell.categoryId}`).toBeDefined()
  return row!.actualCents
}

describe('periodSheet replays Workbook over a typed window (workbook-period part 1)', () => {
  for (const c of golden.expected) {
    const sheet = periodSheet({
      from: isoDate(c.from),
      to: isoDate(c.to),
      categories: golden.input.categories,
      budgets: [],
      plans: [],
      entries: golden.input.entries.map((e) => ({ ...e, postedOn: isoDate(e.postedOn) })),
      statementPeriodEnds: [],
    })
    it.each(c.cells)(`${c.window} → $cell = $actualCents`, (cell) => {
      expect(actualOf(sheet, cell)).toBe(cell.actualCents)
    })
  }
})

interface MonthCase {
  window?: string
  from?: string
  to?: string
  month?: string
  asOf?: string
  cells: Cell[]
}
interface Input2 extends Input {
  plans: PeriodPlan[]
}

const part2 = loadGolden<Input2, MonthCase[]>('workbook-period-part2')

describe('bills, debts and subscriptions replay Workbook (workbook-period part 2)', () => {
  const shared = {
    categories: part2.input.categories,
    plans: part2.input.plans,
    entries: part2.input.entries.map((e) => ({ ...e, postedOn: isoDate(e.postedOn) })),
    statementPeriodEnds: [],
  }
  for (const c of part2.expected) {
    const sheet =
      c.asOf === undefined
        ? periodSheet({ ...shared, budgets: [], from: isoDate(c.from!), to: isoDate(c.to!) })
        : monthSheet({ ...shared, budgetHistory: [], asOf: isoDate(c.asOf) })
    it.each(c.cells)(`${c.window ?? c.month} → $cell = $actualCents`, (cell) => {
      expect(actualOf(sheet, cell)).toBe(cell.actualCents)
    })
  }
})
