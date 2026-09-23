import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { billCalendar, type BillCalendar } from '../src/bill-calendar.js'

/**
 * Suite, not External: the workbook caches one month, January 2025, which
 * workbook-bill-calendar replays. The other shapes of month, and every rule
 * Workbook's January does not exercise, are worked by hand below from F20.
 */

/** A month with nothing in it, but its grid. */
const bare = (month: string) => billCalendar({ month: isoDate(month), categories: [], planHistory: [], entries: [] })

/** Each week as its seven day numbers, 0 for a blank place. */
const grid = (calendar: BillCalendar) => calendar.weeks.map((w) => w.days.map((d) => (d === null ? 0 : d.day)))

describe('billCalendar, the grid', () => {
  it('starts a month whose 1st is a Sunday in the first place, and needs only four weeks for a 28-day one', () => {
    // 1 February 2026 is a Sunday: Workbook's B9 typo (D19) would have hidden its rent.
    expect(grid(bare('2026-02-14'))).toEqual([
      [1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14],
      [15, 16, 17, 18, 19, 20, 21],
      [22, 23, 24, 25, 26, 27, 28],
    ])
  })

  it('runs to six weeks when a 31-day month starts on a Saturday', () => {
    const weeks = grid(bare('2026-08-01'))
    expect(weeks).toHaveLength(6)
    expect(weeks[0]).toEqual([0, 0, 0, 0, 0, 0, 1])
    expect(weeks[5]).toEqual([30, 31, 0, 0, 0, 0, 0])
  })

  it('names the month by its first day, and each day by its date', () => {
    const calendar = bare('2024-02-29')
    expect(calendar.month).toBe('2024-02-01')
    // 29 February 2024 is a Thursday, the leap day, in the fifth week.
    expect(calendar.weeks[4]?.days[4]).toEqual({ date: '2024-02-29', day: 29, bills: [] })
    expect(calendar.weeks[4]?.days[5]).toBeNull()
  })
})
