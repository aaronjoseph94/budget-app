import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import type { PayFrequency } from '../../src/pay-period.js'
import type { PlanHistoryRow } from '../../src/plans.js'
import { paycheckSheet, type PeriodCategory, type PeriodEntry, type PeriodSheet } from '../../src/period-sheet.js'

/**
 * External check: Paycheck Budget's cached cells that hold under D5 and F15 B,
 * over the period found from the schedule D6 and D7 describe. The fixture's
 * $semantics says why that schedule, and which cells cannot hold, and why.
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
  schedule: { firstPayDate: string; frequency: PayFrequency }
  categories: PeriodCategory[]
  planHistory: (Omit<PlanHistoryRow, 'effectiveMonth'> & { effectiveMonth: string })[]
  entries: (Omit<PeriodEntry, 'postedOn'> & { postedOn: string })[]
}

const golden = loadGolden<Input, Cell[]>('workbook-paycheck')

/** The number a cell names: a row's, a block's, or the summary card's. */
function read(sheet: PeriodSheet, c: Cell): unknown {
  const field = (o: object): unknown => new Map(Object.entries(o)).get(c.field)
  if (c.block === undefined) return field(sheet.summary)
  const block = sheet.blocks[c.block]
  if (c.categoryId === undefined) return field(block)
  const row = block.rows.find((r) => r.categoryId === c.categoryId)
  return row === undefined ? undefined : field(row)
}

describe("the Paycheck view replays Workbook's Paycheck Budget (workbook-paycheck)", () => {
  const sheet = paycheckSheet({
    asOf: isoDate(golden.input.asOf),
    schedule: { ...golden.input.schedule, firstPayDate: isoDate(golden.input.schedule.firstPayDate) },
    categories: golden.input.categories,
    budgetHistory: [],
    planHistory: golden.input.planHistory.map((p) => ({ ...p, effectiveMonth: isoDate(p.effectiveMonth) })),
    entries: golden.input.entries.map((e) => ({ ...e, postedOn: isoDate(e.postedOn) })),
    statementPeriodEnds: [],
    startingBalanceCents: null,
  })

  it('is the period Paycheck Budget!D6:D7 types', () => {
    expect([sheet.from, sheet.to]).toEqual(['2025-01-01', '2025-01-14'])
  })

  it.each(golden.expected)('$cell = $cents', (c) => {
    expect(read(sheet, c)).toBe(c.cents)
  })
})
