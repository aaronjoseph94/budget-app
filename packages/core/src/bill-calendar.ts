/**
 * Workbook's Bill Calendar: one month, Sunday first, with what is due each day,
 * who is paid that day, and a total for each week and for the month.
 *
 * Workbook types a month (Bill Calendar!G3) and lays its days out under the
 * weekday headings B6:N6, "S U N D A Y" first: day 1 under G3's weekday
 * (H8), each day one to the right of the one before (J8), a new week band
 * every seven (B14), and nothing past the month's last day (L32 is 31 in
 * January, N32 is blank). Nothing here is stored: the screen asks again on
 * every read (CLAUDE.md, never persist a derived money value).
 *
 * Excel semantics (docs/formula-decisions.md F20):
 *
 * - The calendar has as many weeks as the month touches, four to six;
 *   Workbook always draws six bands and leaves the spare ones blank.
 */
import { type IsoDate, daysBetween } from '@budget/money-primitives'
import { monthBounds } from './week.js'

export interface BillCalendarInput {
  /** Any day of the month to lay out (G3). */
  readonly month: IsoDate
}

export interface CalendarDay {
  readonly date: IsoDate
  /** Day of the month, 1–31. */
  readonly day: number
}

export interface CalendarWeek {
  /** Seven places, Sunday first; null where the day is in another month. */
  readonly days: readonly (CalendarDay | null)[]
}

export interface BillCalendar {
  /** The month's first day. */
  readonly month: IsoDate
  readonly weeks: readonly CalendarWeek[]
}

/** Workbook's own first Sunday: Bill Calendar!B14 is 5 January 2025. */
const A_SUNDAY = '2025-01-05' as IsoDate

export function billCalendar(input: BillCalendarInput): BillCalendar {
  const { start, end } = monthBounds(input.month)
  const last = Number(end.slice(8))

  const dayOf = (day: number): CalendarDay => {
    const date = `${start.slice(0, 8)}${String(day).padStart(2, '0')}` as IsoDate
    return { date, day }
  }

  // Places before the 1st are blank, as B8:F8 are when G3 is a Wednesday.
  const lead = ((daysBetween(A_SUNDAY, start) % 7) + 7) % 7
  const weeks: CalendarWeek[] = []
  for (let first = 1 - lead; first <= last; first += 7) {
    const days = Array.from({ length: 7 }, (_, i) => first + i).map((d) => (d >= 1 && d <= last ? dayOf(d) : null))
    weeks.push({ days })
  }

  return { month: start, weeks }
}
