import { describe, expect, it } from 'vitest'
import { cents, isoDate } from '@budget/money-primitives'
import { changeSize, completeMonths, notableBand, usualMonth } from '../src/index.js'

/** Suite tests, worked by hand from F24 and F27 (docs/formula-decisions.md). */

const d = isoDate
const c = cents
const totals = (...list: [string, number][]) => list.map(([month, v]) => ({ month: d(month), cents: c(v) }))

describe('completeMonths (F24)', () => {
  it('lists the months wholly inside the records and before asOf’s month, newest first', () => {
    // Records from 1 June: June, July and August are whole by 24 September.
    expect(completeMonths({ asOf: d('2026-09-24'), historyStart: d('2026-06-01'), readFrom: d('2025-09-01') })).toEqual({
      months: ['2026-08-01', '2026-07-01', '2026-06-01'],
      evidence: 'some',
    })
  })

  it('leaves out a month the records start part of the way into', () => {
    // Records from 8 August: August is not whole, so nothing is yet.
    expect(completeMonths({ asOf: d('2026-09-24'), historyStart: d('2026-08-08'), readFrom: d('2025-09-01') })).toEqual({
      months: [],
      evidence: 'thin',
    })
  })

  it('leaves out a month that was not read, which is missing, not $0', () => {
    expect(completeMonths({ asOf: d('2026-09-24'), historyStart: d('2025-01-01'), readFrom: d('2026-08-01') })).toEqual({
      months: ['2026-08-01'],
      evidence: 'thin',
    })
  })

  it('is solid from six months, and none without records', () => {
    const six = completeMonths({ asOf: d('2026-09-01'), historyStart: d('2026-03-01'), readFrom: d('2025-09-01') })
    expect(six.months).toHaveLength(6)
    expect(six.evidence).toBe('solid')
    expect(completeMonths({ asOf: d('2026-09-24'), historyStart: null, readFrom: d('2025-09-01') })).toEqual({ months: [], evidence: 'thin' })
  })
})

describe('usualMonth (F27)', () => {
  it('is the median of the six most recent complete months, with its MAD', () => {
    // F27's worked example, and an older February far away that must not count.
    const months = totals(
      ['2026-03-01', 30_000], ['2026-04-01', 42_000], ['2026-05-01', 36_000], ['2026-06-01', 51_000],
      ['2026-07-01', 39_000], ['2026-08-01', 45_000], ['2026-02-01', 999_999],
    )
    expect(usualMonth({ totals: months })).toEqual({ usualCents: 40_500, madCents: 4_500, months: 6, evidence: 'solid' })
  })

  it('works from fewer months, and is none from none', () => {
    expect(usualMonth({ totals: totals(['2026-08-01', 30_760], ['2026-07-01', 20_000]) })).toEqual({
      usualCents: 25_380, madCents: 5_380, months: 2, evidence: 'thin',
    })
    expect(usualMonth({ totals: [] })).toEqual({ usualCents: null, madCents: null, months: 0, evidence: 'thin' })
  })
})

describe('notableBand (F27)', () => {
  const usual = { basis: 'usual', usualCents: c(40_500), madCents: c(4_500), days: 30, daysInMonth: 30 } as const

  it('with three or more months is the largest of $25, 15% of the usual month and three MADs', () => {
    expect(notableBand({ ...usual, months: 6 })).toEqual({ bandCents: 13_500 })
    // 15% of 40,510 is 6,076.5, half-up to 6,077, above three MADs of 0.
    expect(notableBand({ ...usual, usualCents: c(40_510), madCents: c(0), months: 3 })).toEqual({ bandCents: 6_077 })
  })

  it('with one or two months is the larger of $25 and 25% of the usual month', () => {
    // 25% of 40,500 is 10,125; the MAD is not used on so little.
    expect(notableBand({ ...usual, months: 2 })).toEqual({ bandCents: 10_125 })
    expect(notableBand({ ...usual, usualCents: c(1_000), months: 1 })).toEqual({ bandCents: 2_500 })
  })

  it('is scaled to a window of d days of D, half-up, never below $25', () => {
    expect(notableBand({ ...usual, months: 6, days: 24 })).toEqual({ bandCents: 10_800 })
    // 15% of 90,007 is 13,501.05, so 13,501; × 15 ÷ 30 = 6,750.5, half-up to 6,751.
    expect(notableBand({ ...usual, usualCents: c(90_007), madCents: c(0), months: 3, days: 15 })).toEqual({ bandCents: 6_751 })
    expect(notableBand({ ...usual, months: 6, days: 1 })).toEqual({ bandCents: 2_500 })
  })

  it('takes a usual month below zero by its size', () => {
    expect(notableBand({ ...usual, usualCents: c(-40_500), months: 2 })).toEqual({ bandCents: 10_125 })
  })

  it('refuses a window that is not inside its month, or no months', () => {
    expect(() => notableBand({ ...usual, months: 6, days: 0 })).toThrow(RangeError)
    expect(() => notableBand({ ...usual, months: 6, days: 31 })).toThrow(RangeError)
    expect(() => notableBand({ ...usual, months: 0 })).toThrow(RangeError)
  })

  it('for a summary is the larger of $25 and 15% of the earlier figure', () => {
    expect(notableBand({ basis: 'summary', beforeCents: c(118_000) })).toEqual({ bandCents: 17_700 })
    expect(notableBand({ basis: 'summary', beforeCents: c(0) })).toEqual({ bandCents: 2_500 })
  })
})

describe('changeSize (F27)', () => {
  it('is slight under one band, clear to under two, big from two, either way', () => {
    const band = c(10_800)
    expect(changeSize({ changeCents: c(10_799), bandCents: band })).toEqual({ size: 'slight', notable: false })
    expect(changeSize({ changeCents: c(10_800), bandCents: band })).toEqual({ size: 'clear', notable: true })
    expect(changeSize({ changeCents: c(21_240), bandCents: band })).toEqual({ size: 'clear', notable: true })
    expect(changeSize({ changeCents: c(-21_600), bandCents: band })).toEqual({ size: 'big', notable: true })
  })
})
