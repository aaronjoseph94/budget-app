import { describe, expect, it } from 'vitest'
import { balanceLine } from '../src/balance-line.js'
import { bandBars } from '../src/band-bars.js'
import { incomeBars } from '../src/bars.js'
import { goalActualColumns, incomeExpenseColumns } from '../src/columns.js'
import { spendingDoughnut } from '../src/doughnut.js'
import { WIDTH, frame, widthOf } from '../src/frame.js'
import { pairedBars } from '../src/paired-bars.js'
import { yearPie } from '../src/pie.js'
import { rangeBar } from '../src/range-bar.js'
import type { SvgMarkup } from '../src/svg.js'
import { trendLines } from '../src/trend-lines.js'

/**
 * A chart drawn on fewer or more units across (V1, N127). Text is FONT units
 * whatever the width, so a chart in a narrow card is drawn on fewer units
 * and its words keep a readable size; in a wide card, on more. Every builder
 * the app draws at more than one width honours it: its frame says so, and
 * nothing is placed past its right edge.
 */
const at = { id: 'c', title: 't', description: 'd' }

/** The viewBox's width, and the furthest x or x2 any mark is placed at. */
function extent(svg: SvgMarkup): [number, number] {
  const box = /viewBox="0 0 (\d+) \d+"/.exec(svg)
  const xs = [...svg.matchAll(/ (?:x|x2|cx)="(\d+)"/g)].map((m) => Number(m[1]))
  return [Number(box?.[1]), Math.max(...xs)]
}

const builders: [string, (width: number | undefined) => SvgMarkup][] = [
  ['incomeBars', (width) => incomeBars({ ...at, width, bars: [{ label: 'Pay', valueText: '$1.00 of $2.00', goalBp: 10_000, actualBp: 5_000 }] })],
  ['spendingDoughnut', (width) => spendingDoughnut({ ...at, width, slices: [{ label: 'Food', valueText: '$1.00 · 100%', shareBp: 10_000, listIndex: 0 }] })],
  ['yearPie', (width) => yearPie({ ...at, width, palette: 'annual', slices: [1, 2, 3].map((i) => ({ label: `s${i}`, valueText: `v${i}`, shareBp: 3_333 })) })],
  ['incomeExpenseColumns', (width) => incomeExpenseColumns({ ...at, width, columns: [{ label: 'Jan', valueText: 'v', parts: [{ fromBp: 0, toBp: 5_000 }, null] }] })],
  ['goalActualColumns', (width) => goalActualColumns({ ...at, width, groups: [{ label: 'Bills', valueText: 'v', goalBp: 10_000, actualBp: 5_000 }] })],
  ['pairedBars', (width) => pairedBars({ ...at, width, nowName: 'Aug', beforeName: 'Jul', rows: [{ label: 'Food', nowText: '$5', beforeText: '$4', nowBp: 10_000, beforeBp: 8_000 }] })],
  ['balanceLine', (width) => balanceLine({ ...at, width, pointsBp: [10_000, 0, 5_000], zeroBp: 2_000, lowestIndex: 1, lowestText: 'low', startText: 'Today', endText: '24 Oct' })],
  ['bandBars', (width) => bandBars({ ...at, width, zeroBp: 0, columns: [{ label: 'Oct', valueText: '$4', lowBp: 5_000, midBp: 7_500, highBp: 10_000 }] })],
  ['trendLines', (width) => trendLines({ ...at, width, series: [{ name: 'Spent', pointsBp: [10_000, 0], tone: 'spent' }], zeroBp: 0, startText: 'Jun', endText: 'Aug' })],
  ['rangeBar', (width) => rangeBar({ ...at, width, lowBp: 0, midBp: 5_000, highBp: 10_000, todayBp: 10_000, zeroBp: 0, midText: 'About $3', todayText: 'Today $1' })],
]

describe('a chart drawn on its own width', () => {
  it('is WIDTH across unless told otherwise, and says the width it is drawn at', () => {
    expect(widthOf(at)).toBe(WIDTH)
    expect(widthOf({ ...at, width: 2_250 })).toBe(2_250)
    const svg = frame({ ...at, width: 2_250 }, 1_000, [])
    expect(svg).toContain('viewBox="0 0 2250 1000" width="225" height="100"')
  })

  it('refuses a width too narrow for its marks, too wide, or off the 10-unit grid', () => {
    for (const width of [1_990, 5_010, 2_255, Number.NaN]) expect(() => widthOf({ ...at, width })).toThrow(RangeError)
  })

  it.each(builders)('%s draws across the width it is given and no further', (_, draw) => {
    for (const width of [2_000, 3_000, 4_000]) {
      const [box, furthest] = extent(draw(width))
      expect(box).toBe(width)
      expect(furthest).toBeLessThanOrEqual(width)
    }
    expect(draw(undefined)).toBe(draw(WIDTH))
  })
})
