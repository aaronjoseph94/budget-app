import { describe, expect, it } from 'vitest'
import { loadGolden } from '@budget/golden-verification'
import { isoDate } from '@budget/money-primitives'
import { billCalendar, type BillCalendar } from '../../src/bill-calendar.js'

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
}
interface Input {
  month: string
}

const golden = loadGolden<Input, Expected>('workbook-bill-calendar')

function dayAt(calendar: BillCalendar, p: Omit<Place, 'cell'>) {
  const week = calendar.weeks[p.week]
  return week === undefined ? undefined : week.days[p.weekday]
}

describe("the Bill Calendar replays Workbook's Bill Calendar (workbook-bill-calendar)", () => {
  const calendar = billCalendar({ month: isoDate(golden.input.month) })

  it.each(golden.expected.days)('$cell is day $day', (c) => {
    // A blank place is a place in a week the calendar has, holding no day.
    const day = dayAt(calendar, c)
    expect(day === undefined ? 'no such place' : day === null ? null : day.day).toBe(c.day)
  })
})
