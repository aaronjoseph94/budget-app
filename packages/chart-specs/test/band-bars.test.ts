import { describe, expect, it } from 'vitest'
import { bandBars, type BandBarsInput } from '../src/band-bars.js'

/** Suite tests: places worked by hand on the 3,000-unit grid; the plot runs 1,200 units up from y = 1620. */

const chart = (over: Partial<BandBarsInput> = {}) =>
  bandBars({
    id: 'ahead',
    title: 'The next three months',
    description: 'd',
    zeroBp: 0,
    columns: [
      { label: 'Oct', valueText: '$4,620', lowBp: 5_000, midBp: 7_500, highBp: 10_000 },
      { label: 'Nov', valueText: '$5,820', lowBp: 2_500, midBp: 2_500, highBp: 2_500 },
    ],
    ...over,
  })

describe('bandBars', () => {
  it('draws each month’s most likely figure as a bar from $0, inside its band from worst to best', () => {
    // Two columns of 1,500: the band 900 wide from 300, the bar 600 wide from 450.
    // Oct: worst at 1620 − 600 = 1020, best at 420, most likely at 720.
    const svg = chart()
    expect(svg).toContain('<rect x="300" y="420" width="900" height="600" rx="40" fill="#C9DCE1" class="chart-forecast-band"/>')
    expect(svg).toContain('<rect x="450" y="720" width="600" height="900" fill="#2B5D6A" class="chart-forecast-range"/>')
    expect(svg).toContain('<text x="750" y="360" text-anchor="middle"')
    expect(svg).toContain('>Oct</text>')
    expect(svg).toContain('viewBox="0 0 3000 1840"')
  })

  it('draws no band for a rough month, whose worst and best are its one figure', () => {
    // Nov: 2,500 bp, 300 units up, at 1320.
    const svg = chart()
    expect(svg).toContain('<rect x="1950" y="1320" width="600" height="300" fill="#2B5D6A"')
    expect(svg.match(/class="chart-forecast-band"/g)).toHaveLength(2)
  })

  it('draws a figure below $0 down from the $0 line', () => {
    // $0 halfway up, at 1020; a most likely at 0 bp reaches down to 1620.
    const svg = chart({ zeroBp: 5_000, columns: [{ label: 'Oct', valueText: '−$200', lowBp: 0, midBp: 0, highBp: 0 }] })
    expect(svg).toContain('<rect x="900" y="1020" width="1200" height="600" fill="#2B5D6A"')
    expect(svg).toContain('<line x1="0" y1="1020" x2="3000" y2="1020"')
  })

  it('writes every text as text, never as markup', () => {
    const svg = chart({ columns: [{ label: '<b>&', valueText: 'About <i>', lowBp: 0, midBp: 0, highBp: 0 }] })
    expect(svg).toContain('&lt;b&gt;&amp;')
    expect(svg).toContain('<title>&lt;b&gt;&amp;: About &lt;i&gt;</title>')
    expect(svg).not.toContain('<b>')
  })
})
