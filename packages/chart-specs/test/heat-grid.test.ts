import { describe, expect, it } from 'vitest'
import { heatGrid, type HeatGridInput } from '../src/heat-grid.js'

/**
 * Suite tests: places worked by hand on the 3,000-unit grid. Rows start
 * 40 units down and are labelled in the first 360 units; each day is an
 * 80-unit square every 100, so 20 units (2 px) of the card show between.
 */

const day = (level: 0 | 1 | 2 | 3 | 4, title = 'a day') => ({ level, title })
const grid = (over: Partial<HeatGridInput> = {}) =>
  heatGrid({
    id: 'spending-grid',
    title: 'Everyday spending, day by day',
    description: 'd',
    rowLabels: ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'],
    weeks: [
      [null, null, day(0), day(1), day(2), day(3), day(4, 'Sun 9 Aug: $60.00')],
      [day(2, 'Mon 10 Aug: $20.00'), day(0), day(1), null, null, null, null],
    ],
    startText: '3 Aug',
    endText: '10 Aug',
    ...over,
  })

describe('heatGrid', () => {
  it('draws a week to a column and a weekday to a row, each day titled', () => {
    const svg = grid()
    expect(svg).toContain('<rect x="360" y="640" width="80" height="80" rx="16" fill="#5E120D" class="chart-heat-4"><title>Sun 9 Aug: $60.00</title></rect>')
    expect(svg).toContain('<rect x="460" y="40" width="80" height="80" rx="16" fill="#DA6448" class="chart-heat-2"><title>Mon 10 Aug: $20.00</title></rect>')
    expect(svg).toContain('<rect x="460" y="240" width="80" height="80" rx="16" fill="#EBA591" class="chart-heat-1">')
    expect(svg).toContain('fill="#E8E5E1" class="chart-heat-0"')
    expect(svg).toContain('fill="#A42F1A" class="chart-heat-3"')
    expect(svg).toContain('viewBox="0 0 3000 1040"')
  })

  it('leaves a day it is not given undrawn: no records and to come are never a level', () => {
    // 5 days in the first week and 3 in the second, and 5 squares in the key.
    expect(grid().match(/<rect /g)).toHaveLength(13)
  })

  it('labels the rows it is given, and keys the levels from less to more', () => {
    const svg = grid()
    expect(svg).toContain('<text x="0" y="110" fill="#5B6773" class="chart-forecast-ink">Mon</text>')
    expect(svg).toContain('<text x="0" y="310" fill="#5B6773" class="chart-forecast-ink">Wed</text>')
    expect(svg).not.toContain('></text>')
    // "Less" is 4 characters, 280 units, then 60 before the first square.
    expect(svg).toContain('>Less</text>')
    expect(svg).toContain('<rect x="700" y="920" width="80" height="80" rx="16" fill="#E8E5E1" class="chart-heat-0"/>')
    expect(svg).toContain('<text x="1260" y="990" fill="#5B6773" class="chart-forecast-ink">More</text>')
  })

  it('names the first week under its column, and the last only when there is room', () => {
    expect(grid()).toContain('<text x="360" y="860" fill="#5B6773" class="chart-forecast-ink">3 Aug</text>')
    expect(grid()).not.toContain('>10 Aug</text>')
    const six = Array.from({ length: 6 }, () => [day(0), day(0), day(0), day(0), day(0), day(0), day(0)])
    // Six columns end at 360 + 600 − 20 = 940.
    expect(grid({ weeks: six })).toContain('<text x="940" y="860" text-anchor="end" fill="#5B6773" class="chart-forecast-ink">10 Aug</text>')
  })

  it('writes every text as text, never as markup, and refuses a level it has no colour for', () => {
    const svg = grid({ title: 'Grid <b>&', weeks: [[day(1, '<img src=x>'), null, null, null, null, null, null]] })
    expect(svg).toContain('>Grid &lt;b&gt;&amp;</title>')
    expect(svg).toContain('<title>&lt;img src=x&gt;</title>')
    expect(svg).not.toContain('<img')
    expect(() => grid({ weeks: [[{ level: 5 as 4, title: 'x' }, null, null, null, null, null, null]] })).toThrow(RangeError)
  })
})
