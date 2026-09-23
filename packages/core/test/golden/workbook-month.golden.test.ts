import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import type { BudgetHistoryRow } from '../../src/budgets.js'
import { monthSheet, periodSheet, type PeriodBudget, type PeriodCategory, type PeriodEntry, type PeriodSheet } from '../../src/period-sheet.js'

/**
 * External check: budget and goal totals, Remaining and Difference, each a
 * cached value from the Workbook workbook. January's cells come through
 * monthSheet from the typed budgets as history, February's typed zeros
 * included, so resolution is replayed too. January's Actuals are all 0 (plan
 * §5.5), so Weekly Budget and Paycheck Budget supply the two cells that
 * subtract a real Actual.
 */

type Block = keyof PeriodSheet['blocks']
interface Cell {
  cell: string
  block: Block
  /** Null asserts the block's total rather than one row. */
  categoryId: string | null
  field: 'budgetTotalCents' | 'remainingTotalCents' | 'differenceTotalCents' | 'remainingCents' | 'differenceCents'
  cents: number
}
interface Case {
  window: string
  asOf?: string
  budgetHistory?: (Omit<BudgetHistoryRow, 'month'> & { month: string })[]
  from?: string
  to?: string
  budgets?: PeriodBudget[]
  cells: Cell[]
}
interface Input {
  categories: PeriodCategory[]
  entries: (Omit<PeriodEntry, 'postedOn'> & { postedOn: string })[]
}

const golden = loadGolden<Input, Case[]>('workbook-month-part1')

function valueOf(sheet: PeriodSheet, c: Cell): number | null {
  if (c.field === 'remainingTotalCents' && c.block === 'variable') return sheet.blocks.variable.remainingTotalCents
  if (c.field === 'differenceTotalCents' && c.block === 'savings') return sheet.blocks.savings.differenceTotalCents
  const block = sheet.blocks[c.block]
  if (c.field === 'budgetTotalCents' && c.categoryId === null) return block.budgetTotalCents
  const row = block.rows.find((r) => r.categoryId === c.categoryId)
  expect(row, `${c.cell}: no ${c.block} row for ${c.categoryId}`).toBeDefined()
  expect(c.field === 'remainingCents' || c.field === 'differenceCents', `${c.cell}: ${c.field} is not a row field`).toBe(true)
  return c.field === 'remainingCents' ? row!.remainingCents : row!.differenceCents
}

describe('budgets, goals, Remaining and Difference replay Workbook (workbook-month part 1)', () => {
  const shared = {
    categories: golden.input.categories,
    plans: [],
    entries: golden.input.entries.map((e) => ({ ...e, postedOn: isoDate(e.postedOn) })),
    statementPeriodEnds: [],
  }
  for (const c of golden.expected) {
    const sheet =
      c.asOf === undefined
        ? periodSheet({ ...shared, budgets: c.budgets!, from: isoDate(c.from!), to: isoDate(c.to!) })
        : monthSheet({
            ...shared,
            asOf: isoDate(c.asOf),
            budgetHistory: c.budgetHistory!.map((h) => ({ ...h, month: isoDate(h.month) })),
          })
    it.each(c.cells)(`${c.window} → $cell = $cents`, (cell) => {
      expect(valueOf(sheet, cell)).toBe(cell.cents)
    })
  }
})
