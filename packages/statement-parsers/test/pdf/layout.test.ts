import { describe, expect, it } from 'vitest'
import { groupRows } from '../../src/pdf/layout.js'
import type { TextRun } from '../../src/pdf/text.js'

/**
 * The column boundaries a Rogers statement needs.
 *
 * Measured, not guessed. Across all 80 transaction rows of a real statement,
 * the description column never reaches past x=265.7 and the leftmost amount
 * starts at x=333.1 — the widest one, `-1,000.00`, right-aligned like the
 * rest. The boundary sits in the middle of that 67-unit gap rather than
 * against either edge, so a larger amount does not slide into the description
 * and a longer description does not slide into the amount.
 */
const COLUMNS = [20, 55, 90, 300]

const run = (x: number, y: number, text: string): TextRun => ({ x, y, text })

describe('rebuilding a table row from positions', () => {
  it('joins the loose words of each column', () => {
    const runs = [
      run(25.68, 349.66, 'Aug'),
      run(41.52, 349.66, '7'),
      run(59.04, 349.66, 'Aug'),
      run(74.88, 349.66, '10'),
      run(95.04, 349.66, 'LAVA'),
      run(116.64, 349.66, 'GRILL'),
      run(171.36, 349.66, 'RED'),
      run(189.6, 349.66, 'DEER'),
      run(221.52, 349.66, 'AB'),
      run(346.8, 349.66, '31.45'),
    ]
    expect(groupRows(runs, COLUMNS)[0]?.columns).toEqual([
      'Aug 7',
      'Aug 10',
      'LAVA GRILL RED DEER AB',
      '31.45',
    ])
  })

  it('keeps the widest real amount out of the description column', () => {
    // `-1,000.00` starts at x=333.12 on the real statement. A boundary set at
    // the amount column's usual left edge would put it in the description and
    // leave the amount empty, dropping a $1,000 payment from the import.
    const runs = [
      run(25.68, 300, 'Sep'),
      run(41.52, 300, '1'),
      run(59.04, 300, 'Sep'),
      run(74.88, 300, '2'),
      run(95.04, 300, 'PAYMENT,'),
      run(136.32, 300, 'THANK'),
      run(164.4, 300, 'YOU'),
      run(333.12, 300, '-1,000.00'),
    ]
    expect(groupRows(runs, COLUMNS)[0]?.columns[3]).toBe('-1,000.00')
  })

  it('tolerates a baseline that wobbles within the row', () => {
    const runs = [run(95, 349.66, 'A'), run(150, 348.1, 'B'), run(340, 350.4, '1.00')]
    expect(groupRows(runs, COLUMNS)[0]?.columns[2]).toBe('A B')
  })

  it('does not merge two adjacent rows', () => {
    // Rows sit 11.29 units apart on the real statement; merging them would
    // join two transactions into one and lose an amount.
    const runs = [run(95, 349.66, 'FIRST'), run(95, 338.37, 'SECOND')]
    expect(groupRows(runs, COLUMNS).map((r) => r.columns[2])).toEqual(['FIRST', 'SECOND'])
  })
})

describe('ordering', () => {
  it('returns rows top of page first', () => {
    // A `Card Number XXXX 0472` heading applies to the rows BELOW it. Read
    // bottom-up, a multi-card statement attributes charges to the wrong card.
    const runs = [run(95, 300, 'THIRD'), run(95, 500, 'FIRST'), run(95, 400, 'SECOND')]
    expect(groupRows(runs, COLUMNS).map((r) => r.columns[2])).toEqual([
      'FIRST',
      'SECOND',
      'THIRD',
    ])
  })
})

describe('runs that belong to no column', () => {
  it('drops a run left of every boundary instead of forcing it into column 0', () => {
    // Page furniture in the margin is not table content. Putting it in the
    // first column makes the date unparseable and rejects the whole row.
    const runs = [run(5, 349, '*'), run(25.68, 349, 'Aug'), run(41.52, 349, '7')]
    expect(groupRows(runs, COLUMNS)[0]?.columns[0]).toBe('Aug 7')
  })

  it('collapses runs of whitespace within a column', () => {
    const runs = [run(95, 349, 'A  '), run(120, 349, '  B')]
    expect(groupRows(runs, COLUMNS)[0]?.columns[2]).toBe('A B')
  })
})
