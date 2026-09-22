import { describe, expect, it } from 'vitest'
import { dateFormatCandidates, parseStatementDate } from '../src/index.js'

const ok = (value: string) => ({ ok: true, value })

describe('parseStatementDate', () => {
  it('reads each declared format', () => {
    expect(parseStatementDate('2025-03-01', 'YYYY-MM-DD')).toEqual(ok('2025-03-01'))
    expect(parseStatementDate('03/01/2025', 'MM/DD/YYYY')).toEqual(ok('2025-03-01'))
    expect(parseStatementDate('01/03/2025', 'DD/MM/YYYY')).toEqual(ok('2025-03-01'))
    expect(parseStatementDate('03/01/25', 'MM/DD/YY')).toEqual(ok('2025-03-01'))
    expect(parseStatementDate('01/03/25', 'DD/MM/YY')).toEqual(ok('2025-03-01'))
  })

  it('reads the SAME text as two different days under two formats', () => {
    // The whole reason the format is declared. Nothing in "03/04/2025" says
    // which of these the bank meant, and the difference is a month.
    expect(parseStatementDate('03/04/2025', 'MM/DD/YYYY')).toEqual(ok('2025-03-04'))
    expect(parseStatementDate('03/04/2025', 'DD/MM/YYYY')).toEqual(ok('2025-04-03'))
  })

  it('accepts dashes where a slash format is declared', () => {
    // Exports disagree on the separator but not on the field order.
    expect(parseStatementDate('03-01-2025', 'MM/DD/YYYY')).toEqual(ok('2025-03-01'))
  })

  it('accepts unpadded components', () => {
    expect(parseStatementDate('3/1/2025', 'MM/DD/YYYY')).toEqual(ok('2025-03-01'))
    expect(parseStatementDate('2025-3-1', 'YYYY-MM-DD')).toEqual(ok('2025-03-01'))
  })

  it('pivots a two-digit year predictably', () => {
    expect(parseStatementDate('01/01/25', 'MM/DD/YY')).toEqual(ok('2025-01-01'))
    expect(parseStatementDate('01/01/68', 'MM/DD/YY')).toEqual(ok('2068-01-01'))
    // 69 and up is the previous century, per POSIX. Absurd on a card statement,
    // which is the point: it is visible in the queue rather than silently 2069.
    expect(parseStatementDate('01/01/69', 'MM/DD/YY')).toEqual(ok('1969-01-01'))
  })

  it('does not accept a year of the wrong width for the declared format', () => {
    // A column that switched from 2-digit to 4-digit years mid-file is a
    // different column, not a lenient one.
    expect(parseStatementDate('03/01/2025', 'MM/DD/YY').ok).toBe(false)
    expect(parseStatementDate('03/01/25', 'MM/DD/YYYY').ok).toBe(false)
  })

  it('rejects a day that does not exist rather than rolling it forward', () => {
    // Date arithmetic would turn 31/02 into the 3rd of March without complaint.
    expect(parseStatementDate('02/31/2025', 'MM/DD/YYYY').ok).toBe(false)
    expect(parseStatementDate('02/29/2025', 'MM/DD/YYYY').ok).toBe(false)
    expect(parseStatementDate('02/29/2024', 'MM/DD/YYYY')).toEqual(ok('2024-02-29'))
  })

  it('rejects an out-of-range month', () => {
    expect(parseStatementDate('13/01/2025', 'MM/DD/YYYY').ok).toBe(false)
    expect(parseStatementDate('00/01/2025', 'MM/DD/YYYY').ok).toBe(false)
  })

  it('reports an empty cell as missing, not as unparseable', () => {
    // Different queue reasons: one is a gap in the export, the other is text
    // the importer could not read. The user is told which.
    expect(parseStatementDate('', 'MM/DD/YYYY')).toEqual({ ok: false, reason: 'missing_date' })
    expect(parseStatementDate('   ', 'MM/DD/YYYY')).toEqual({ ok: false, reason: 'missing_date' })
    expect(parseStatementDate('n/a', 'MM/DD/YYYY')).toEqual({
      ok: false,
      reason: 'unparseable_date',
    })
  })

  it.each([
    ['a written month', 'Mar 1, 2025'],
    ['an instant', '2025-03-01T00:00:00Z'],
    ['too many parts', '01/02/03/04'],
    ['letters', 'yesterday'],
  ])('rejects %s', (_label, raw) => {
    expect(parseStatementDate(raw, 'MM/DD/YYYY').ok).toBe(false)
    expect(parseStatementDate(raw, 'YYYY-MM-DD').ok).toBe(false)
  })

  it('never puts the input into the failure it reports', () => {
    const result = parseStatementDate('SECRET-99-99', 'YYYY-MM-DD')
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('SECRET')
  })
})

describe('dateFormatCandidates', () => {
  it('narrows to day-first when a day exceeds twelve', () => {
    // 13 cannot be a month, so this column can only be read one way.
    expect(dateFormatCandidates(['13/04/2025', '01/03/2025'])).toEqual(['DD/MM/YYYY'])
  })

  it('narrows to month-first when the first component exceeds twelve', () => {
    expect(dateFormatCandidates(['04/13/2025', '03/01/2025'])).toEqual(['MM/DD/YYYY'])
  })

  it('returns BOTH when the column is genuinely ambiguous', () => {
    // Every day is 12 or lower, so no number of rows settles it. Returning one
    // would be a guess; the importer asks the user instead.
    expect(dateFormatCandidates(['03/04/2025', '01/02/2025'])).toEqual([
      'MM/DD/YYYY',
      'DD/MM/YYYY',
    ])
  })

  it('identifies an unambiguous ISO column', () => {
    expect(dateFormatCandidates(['2025-03-01', '2025-12-31'])).toEqual(['YYYY-MM-DD'])
  })

  it('returns nothing when the column is not dates at all', () => {
    expect(dateFormatCandidates(['Blue Bottle', 'Shell'])).toEqual([])
  })

  it('returns nothing when the column mixes incompatible orders', () => {
    // 13/04 must be day-first and 04/13 must be month-first. No single format
    // reads both, so the importer must not pick one and mangle half the file.
    expect(dateFormatCandidates(['13/04/2025', '04/13/2025'])).toEqual([])
  })

  it('ignores blank cells rather than letting them eliminate the format', () => {
    expect(dateFormatCandidates(['13/04/2025', '', '  '])).toEqual(['DD/MM/YYYY'])
  })

  it('returns nothing for an empty column', () => {
    expect(dateFormatCandidates([])).toEqual([])
    expect(dateFormatCandidates(['', '   '])).toEqual([])
  })
})
