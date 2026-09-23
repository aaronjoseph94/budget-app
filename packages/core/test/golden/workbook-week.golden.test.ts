import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import type { PlanHistoryRow } from '../../src/plans.js'
import { weekSheet, type PeriodEntry, type PeriodSheet, type WeekCategory } from '../../src/period-sheet.js'

/**
 * External check: Weekly Budget's cached cells, replayed through the Week the
 * app shows, Monday to Sunday (D14), with each category's weekly budget as
 * its Budgeted or Goal cell. The fixture's $semantics says why Workbook's
 * Wednesday-to-Tuesday window gives the same cells.
 */

type Block = keyof PeriodSheet['blocks']
interface Cell {
  cell: string
  block?: Block
  categoryId?: string
  field: string
  cents: number
}
interface Input {
  asOf: string
  categories: WeekCategory[]
  planHistory: (Omit<PlanHistoryRow, 'effectiveMonth'> & { effectiveMonth: string })[]
  entries: (Omit<PeriodEntry, 'postedOn'> & { postedOn: string })[]
}

const golden = loadGolden<Input, Cell[]>('workbook-week')

/** The number a cell names: a row's, a block's, or the summary card's. */
function read(sheet: PeriodSheet, c: Cell): unknown {
  const field = (o: object): unknown => new Map(Object.entries(o)).get(c.field)
  if (c.block === undefined) return field(sheet.summary)
  const block = sheet.blocks[c.block]
  if (c.categoryId === undefined) return field(block)
  const row = block.rows.find((r) => r.categoryId === c.categoryId)
  return row === undefined ? undefined : field(row)
}

describe("the Week replays Workbook's Weekly Budget (workbook-week)", () => {
  const sheet = weekSheet({
    asOf: isoDate(golden.input.asOf),
    categories: golden.input.categories,
    planHistory: golden.input.planHistory.map((p) => ({ ...p, effectiveMonth: isoDate(p.effectiveMonth) })),
    entries: golden.input.entries.map((e) => ({ ...e, postedOn: isoDate(e.postedOn) })),
    statementPeriodEnds: [],
    startingBalanceCents: null,
  })

  it('is the Monday-to-Sunday week holding Weekly Budget!D6 (D14)', () => {
    expect([sheet.from, sheet.to]).toEqual(['2024-12-30', '2025-01-05'])
  })

  it.each(golden.expected)('$cell = $cents', (c) => {
    expect(read(sheet, c)).toBe(c.cents)
  })
})
