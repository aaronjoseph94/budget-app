/**
 * Weeks and months as dates: the Monday-to-Sunday week, the Sunday
 * check-in's week, the calendar month and stepping between them, and the
 * workbook's lists as core names them. Nothing here touches money; the
 * Week's figures are weekSheet's (period-sheet.ts).
 */
import { type IsoDate, addDays, addMonths, daysBetween } from '@budget/money-primitives'

/** The workbook's lists (migration 0005's category_kind), as core names them. */
export type CategoryKind = 'income' | 'savings' | 'bill' | 'debt' | 'subscription' | 'variable' | 'transfer'

/**
 * The lists whose rows are spending, and so the only ones a weekly budget
 * counts on. Exported so a screen offering weekly budgets offers them on
 * these lists alone (N19).
 */
export const SPENDING_LISTS: readonly CategoryKind[] = ['bill', 'debt', 'subscription', 'variable']

/** A known Monday, used to find the day of the week without a clock. */
const A_MONDAY = '1970-01-05' as IsoDate

/**
 * The Monday-to-Sunday week containing `date`.
 *
 * Monday-first because that is where a working week and a weekend belong
 * together: a Sunday-first week splits Saturday from Sunday, and the weekend is
 * where most discretionary spending happens.
 */
export function weekBounds(date: IsoDate): { start: IsoDate; end: IsoDate } {
  const offset = ((daysBetween(A_MONDAY, date) % 7) + 7) % 7
  const start = addDays(date, -offset)
  return { start, end: addDays(start, 6) }
}

export interface CheckinWeek {
  /** Its Monday. */
  readonly start: IsoDate
  /** Its Sunday, on or before asOf. */
  readonly end: IsoDate
}

/**
 * F42: the week the Sunday check-in is about, the one ending on the latest
 * Sunday on or before asOf. Here rather than in checkin.ts because the
 * app's tab bar asks it on every screen, and this module is already in the
 * first load; the rest of the check-in is not.
 */
export function checkinWeek(input: { readonly asOf: IsoDate }): CheckinWeek {
  const thisWeek = weekBounds(input.asOf)
  // Only on its Sunday has this week ended; any other day, the check-in is about the week before.
  return thisWeek.end === input.asOf ? thisWeek : weekBounds(addDays(input.asOf, -7))
}

/** The calendar month containing `date`, first day to last. */
export function monthBounds(date: IsoDate): { start: IsoDate; end: IsoDate } {
  const start = `${date.slice(0, 7)}-01` as IsoDate
  return { start, end: addDays(addMonths(start, 1), -1) }
}

/**
 * The first of the month `months` away. Stepped from the 1st so that a
 * 31st never skips a shorter month on the way.
 */
export function shiftMonth(date: IsoDate, months: number): IsoDate {
  return addMonths(`${date.slice(0, 7)}-01` as IsoDate, months)
}

/** The same weekday, `weeks` weeks away. For stepping between weeks. */
export function shiftWeek(date: IsoDate, weeks: number): IsoDate {
  return addDays(date, weeks * 7)
}
