import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import { billCalendar, type BillCalendar } from '../../src/bill-calendar.js'
import type { PeriodCategory, PeriodEntry } from '../../src/period-sheet.js'
import type { PlanHistoryRow } from '../../src/plans.js'

/**
 * External check: Bill Calendar's cached cells that hold under D5 (F20), for
 * January 2025. The fixture's $semantics says which cells cannot hold, and why.
 */

interface Place {
  cell: string
  week: number
  weekday: number
}
interface Expected {
  days: (Place & { day: number | null })[]
  items: (Place & { items: { name: string; cents: number }[] })[]
  weekTotals: { cell: string; week: number; cents: number }[]
}
interface Input {
  month: string
  categories: PeriodCategory[]
  planHistory: (Omit<PlanHistoryRow, 'effectiveMonth'> & { effectiveMonth: string })[]
  entries: (Omit<PeriodEntry, 'postedOn'> & { postedOn: string })[]
}

const golden = loadGolden<Input, Expected>('workbook-bill-calendar')

function dayAt(calendar: BillCalendar, p: Omit<Place, 'cell'>) {
  const week = calendar.weeks[p.week]
  return week === undefined ? undefined : week.days[p.weekday]
}

describe("the Bill Calendar replays Workbook's Bill Calendar (workbook-bill-calendar)", () => {
  const calendar = billCalendar({
    month: isoDate(golden.input.month),
    categories: golden.input.categories,
    planHistory: golden.input.planHistory.map((p) => ({ ...p, effectiveMonth: isoDate(p.effectiveMonth) })),
    entries: golden.input.entries.map((e) => ({ ...e, postedOn: isoDate(e.postedOn) })),
  })

  it.each(golden.expected.days)('$cell is day $day', (c) => {
    // A blank place is a place in a week the calendar has, holding no day.
    const day = dayAt(calendar, c)
    expect(day === undefined ? 'no such place' : day === null ? null : day.day).toBe(c.day)
  })

  it.each(golden.expected.items)('$cell lists what is due that day', (c) => {
    const day = dayAt(calendar, c)
    expect(day?.bills.map((b) => ({ name: b.name, cents: b.amountCents }))).toEqual(c.items)
  })

  it.each(golden.expected.weekTotals)('$cell = $cents', (c) => {
    expect(calendar.weeks[c.week]?.totalCents).toBe(c.cents)
  })
})
