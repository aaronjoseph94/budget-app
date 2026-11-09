import { isoDate } from '@budget/core'
import type { IsoDate } from '@budget/money-primitives'

/** The earliest year a typed day may carry, as a statement's dates may (statement-parsers, EARLIEST_YEAR). */
const EARLIEST_YEAR = 1900

/**
 * A day typed into a date field, as the app can keep it: YYYY-MM-DD, a
 * real date, from 1900 on. A computer's date field takes a year of up to
 * six digits and one of two ("26" is the year 0026), and Postgres stores
 * either; the engine reads four digits and no others, so a goal saved with
 * such a year took Savings and the Coach down at every visit.
 */
export function isDay(text: string): boolean {
  try {
    return Number(isoDate(text).slice(0, 4)) >= EARLIEST_YEAR
  } catch {
    return false
  }
}

/**
 * A stored day for the engine, or null where it is not one the engine can
 * read: a row saved before the forms checked is then drawn as having no
 * date, and can be opened and put right.
 */
export function storedDay(text: string | null): IsoDate | null {
  if (text === null) return null
  try {
    return isoDate(text)
  } catch {
    return null
  }
}

/** What a form says of a day it will not keep. */
export const NOT_A_DAY = 'has a year the app cannot keep. Choose it again, with a four-digit year from 1900 on.'
