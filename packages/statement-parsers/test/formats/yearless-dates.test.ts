import { describe, expect, it } from 'vitest'
import type { IsoDate } from '@budget/money-primitives'
import {
  daysFromCivil,
  daysInMonth,
  civilDate,
  resolveYear,
  type StatementPeriod,
} from '../../src/formats/yearless-dates.js'

const period = (from: string, to: string): StatementPeriod => ({
  from: from as IsoDate,
  to: to as IsoDate,
})

describe('resolving the year of a date that has none', () => {
  const august = period('2026-08-08', '2026-09-07')

  it('takes the year from the period', () => {
    expect(resolveYear(8, 20, august)).toBe(2026)
    expect(resolveYear(9, 1, august)).toBe(2026)
  })

  it('accepts a purchase made shortly BEFORE the period opened', () => {
    // A transaction dates from when the card was used but lands on the
    // statement whose period contains its posting date. The real sample opens
    // on the 8th and its first transaction is the 6th.
    expect(resolveYear(8, 6, august)).toBe(2026)
  })

  it('rejects a date too far before the period to belong to it', () => {
    // Outside the lookback window there is no candidate year, and a
    // nearest-match would silently place it in this statement anyway.
    expect(resolveYear(3, 1, august)).toBeNull()
  })

  it('rejects a date after the period ends', () => {
    expect(resolveYear(10, 1, august)).toBeNull()
  })
})

describe('a period that straddles new year', () => {
  const december = period('2026-12-08', '2027-01-07')

  it('gives a January date the later year', () => {
    expect(resolveYear(1, 3, december)).toBe(2027)
  })

  it('gives a December date the earlier year', () => {
    expect(resolveYear(12, 10, december)).toBe(2026)
  })

  it('still accepts the lookback before the period, in the earlier year', () => {
    // December 1st precedes the period start but sits inside the window.
    expect(resolveYear(12, 1, december)).toBe(2026)
  })

  it('does not let a January date land twelve months wrong', () => {
    // The failure this whole module exists to prevent: 2026-01-03 is a real
    // date, a plausible one, and eleven months adrift.
    expect(resolveYear(1, 3, december)).not.toBe(2026)
  })
})

describe('dates that are not dates', () => {
  it('refuses February 29th in a year that has none', () => {
    // Moving it to the 28th or to March 1st would be inventing a transaction
    // date the statement never printed.
    expect(resolveYear(2, 29, period('2027-02-01', '2027-03-01'))).toBeNull()
  })

  it('accepts February 29th in a leap year', () => {
    expect(resolveYear(2, 29, period('2028-02-01', '2028-03-01'))).toBe(2028)
  })

  it('refuses a day outside the month', () => {
    expect(resolveYear(4, 31, period('2026-04-01', '2026-05-01'))).toBeNull()
    expect(resolveYear(1, 0, period('2026-01-01', '2026-02-01'))).toBeNull()
  })

  it('refuses a malformed period rather than assuming one', () => {
    expect(resolveYear(8, 20, period('not-a-date', '2026-09-07'))).toBeNull()
  })
})

describe('the day arithmetic underneath', () => {
  it('counts days from the epoch', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0)
    expect(daysFromCivil(1970, 1, 2)).toBe(1)
    expect(daysFromCivil(2000, 3, 1)).toBe(11_017)
    expect(daysFromCivil(2026, 9, 22)).toBe(20_718)
  })

  it('spans a leap day correctly', () => {
    expect(daysFromCivil(2028, 3, 1) - daysFromCivil(2028, 2, 28)).toBe(2)
    expect(daysFromCivil(2027, 3, 1) - daysFromCivil(2027, 2, 28)).toBe(1)
  })

  it('knows the century rule', () => {
    expect(daysInMonth(2000, 2)).toBe(29)
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
  })

  it('pads an ISO date', () => {
    expect(civilDate(2026, 8, 6)).toBe('2026-08-06')
    expect(civilDate(2026, 12, 31)).toBe('2026-12-31')
    // Testing fuzz-06: year 19 came out as '19-01-05', no ISO date at all.
    expect(civilDate(19, 1, 5)).toBe('0019-01-05')
  })
})
