import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import type { BudgetHistoryRow } from '../../src/budgets.js'
import type { PeriodCategory, PeriodEntry } from '../../src/period-sheet.js'
import type { PlanHistoryRow } from '../../src/plans.js'
import { yearSheet, type YearSheet } from '../../src/year-sheet.js'

/**
 * External check: Annual Budget's month rows, totals and starting balance,
 * each a cached value from the Workbook workbook, transcribed under F11 (the
 * fixture's $semantics says how). The Year gates planned amounts at its asOf,
 * Annual's typed Current Month (F10).
 */

type Dated<T, K extends keyof T> = Omit<T, K> & { [P in K]: string }
interface Input {
  startMonth: string
  asOf: string
  categories: PeriodCategory[]
  budgetHistory: Dated<BudgetHistoryRow, 'month'>[]
  planHistory: Dated<PlanHistoryRow, 'effectiveMonth'>[]
  entries: Dated<PeriodEntry, 'postedOn'>[]
  startingBalances: { month: string; cents: number }[]
}
type Group = keyof YearSheet['totals']
interface Cell {
  cell: string
  group: Group
  /** Null asserts the twelve-month total rather than one month's row. */
  month: string | null
  field: 'budgetCents' | 'actualCents'
  cents: number
}

function yearFrom(input: Input): YearSheet {
  return yearSheet({
    startMonth: isoDate(input.startMonth),
    asOf: isoDate(input.asOf),
    categories: input.categories,
    budgetHistory: input.budgetHistory.map((h) => ({ ...h, month: isoDate(h.month) })),
    planHistory: input.planHistory.map((p) => ({ ...p, effectiveMonth: isoDate(p.effectiveMonth) })),
    entries: input.entries.map((e) => ({ ...e, postedOn: isoDate(e.postedOn) })),
    startingBalances: input.startingBalances.map((b) => ({ month: isoDate(b.month), cents: b.cents })),
  })
}

const part1 = loadGolden<Input, { startingBalance: { cell: string; cents: number }; cells: Cell[] }>('workbook-year-part1')

describe('the Year replays Annual Budget (workbook-year part 1)', () => {
  const sheet = yearFrom(part1.input)

  it.each(part1.expected.cells)('$cell = $cents', (c) => {
    const row = c.month === null ? sheet.totals : sheet.months.find((m) => m.month === c.month)
    expect(row, `${c.cell}: no row for ${c.month}`).toBeDefined()
    expect(row![c.group][c.field]).toBe(c.cents)
  })

  it(`${part1.expected.startingBalance.cell} = ${part1.expected.startingBalance.cents}`, () => {
    expect(sheet.startingBalanceCents).toBe(part1.expected.startingBalance.cents)
  })
})
