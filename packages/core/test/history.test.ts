import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { historyStart } from '../src/history.js'

/** Suite tests, worked by hand from F24 (docs/formula-decisions.md). */

const days = (...values: string[]) => values.map((v) => isoDate(v))

describe('historyStart (F24)', () => {
  it("is the earliest statement period's first day, in any order, before an earlier typed row", () => {
    expect(
      historyStart({ statementPeriodStarts: days('2026-09-08', '2026-08-08'), entryDates: days('2026-08-02') }),
    ).toEqual({ start: '2026-08-08', from: 'statement' })
  })

  it('is the earliest ledger date when no statement has a period', () => {
    expect(historyStart({ statementPeriodStarts: [], entryDates: days('2026-07-19', '2026-07-03') })).toEqual({
      start: '2026-07-03',
      from: 'ledger',
    })
  })

  it('is none with no statement and no ledger row', () => {
    expect(historyStart({ statementPeriodStarts: [], entryDates: [] })).toEqual({ start: null, from: 'none' })
  })
})
