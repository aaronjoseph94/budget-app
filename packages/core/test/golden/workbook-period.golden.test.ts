import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import { periodSheet, type PeriodCategory, type PeriodEntry, type PeriodSheet } from '../../src/period-sheet.js'

/**
 * External check: every expected number is a cached value from the Workbook
 * workbook's Weekly Budget and Paycheck Budget tabs, whose windows run over
 * the Transactions sample (plan §5.5 (a)). The engine is run once per window.
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
      entries: golden.input.entries.map((e) => ({ ...e, postedOn: isoDate(e.postedOn) })),
    })
    it.each(c.cells)(`${c.window} → $cell = $actualCents`, (cell) => {
      expect(actualOf(sheet, cell)).toBe(cell.actualCents)
    })
  }
})
