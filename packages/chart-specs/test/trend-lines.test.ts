import { describe, expect, it } from 'vitest'
import { sparkline, trendLines, type SparklineInput, type TrendLinesInput } from '../src/trend-lines.js'

/**
 * Suite tests: places worked by hand on the 3,000-unit grid. The trend
 * lines are 80 in from each side, the plot 1,200 tall from 260; the
 * sparkline 60 in, 600 tall from 60.
 */

const lines = (over: Partial<TrendLinesInput> = {}) =>
  trendLines({
    id: 'totals',
    title: 'Income, Spent and Saved',
    description: 'd',
    series: [{ name: 'Spent', pointsBp: [10_000, 0, 5_000], tone: 'spent' }],
    zeroBp: 0,
    startText: 'Jun',
    endText: 'Aug',
    ...over,
  })

const spark = (over: Partial<SparklineInput> = {}) =>
  sparkline({ id: 'dining', title: 'Dining out', description: 'd', pointsBp: [10_000, 0, 5_000], usualBp: 8_000, ...over })

describe('trendLines', () => {
  it('spreads the months evenly across and raises each by its place', () => {
    // Three months at 80, 1,500 and 2,920; 10,000 bp at 260, 0 at 1,460, 5,000 at 860.
    const svg = lines()
    expect(svg).toContain('<polyline points="80,260 1500,1460 2920,860" fill="none"')
    expect(svg).toContain('viewBox="0 0 3000 1740"')
    expect(svg).toContain('<text x="80" y="1680" fill="#5B6773" class="chart-forecast-ink">Jun</text>')
    expect(svg).toContain('<text x="2920" y="1680" text-anchor="end" fill="#5B6773" class="chart-forecast-ink">Aug</text>')
  })

  it('breaks a line at a month with no records, rather than drawing it at $0', () => {
    // Six months at 80, 648, 1,216, 1,784, 2,352 and 2,920: the first two a run, the fourth alone, the last a run.
    const svg = lines({ series: [{ name: 'Spent', pointsBp: [5_000, 5_000, null, 10_000, null, 0], tone: 'spent' }] })
    expect(svg).toContain('<polyline points="80,860 648,860" fill="none"')
    expect(svg).toContain('<circle cx="1784" cy="260" r="40" fill="#B83A3A" class="chart-trend-spent-dot"/>')
    expect(svg).toContain('<circle cx="2920" cy="1460" r="40"')
    expect(svg.match(/<polyline/g)).toHaveLength(1)
    // A line of nothing but gaps draws nothing.
    expect(lines({ series: [{ name: 'Spent', pointsBp: [null, null], tone: 'spent' }] })).not.toMatch(/<polyline|<circle/)
  })

  it('tells the lines apart by dash as well as colour, and names each in a key', () => {
    const svg = lines({
      series: [
        { name: 'Income', pointsBp: [0, 10_000], tone: 'income' },
        { name: 'Spent', pointsBp: [0, 10_000], tone: 'spent' },
        { name: 'Saved', pointsBp: [0, 10_000], tone: 'saved' },
      ],
    })
    expect(svg).toContain('stroke="#4F6E69" stroke-dasharray="90 40" class="chart-trend-income"')
    expect(svg).toContain('stroke="#7C5512" stroke-dasharray="20 40" class="chart-trend-saved"')
    // Three keys a third of the width apart.
    expect(svg).toContain('<line x1="1000" y1="80" x2="1200" y2="80" stroke-width="30" stroke="#B83A3A"')
    expect(svg).toContain('<text x="2260" y="120" fill="#5B6773" class="chart-forecast-ink">Saved</text>')
  })

  it('draws $0 as a dashed rule where it sits', () => {
    expect(lines({ zeroBp: 2_500 })).toContain('<line x1="80" y1="1160" x2="2920" y2="1160" stroke="#A8A29E"')
  })

  it('writes every name as text, never as markup', () => {
    const svg = lines({ series: [{ name: 'Fun & <b>', pointsBp: [0], tone: 'spent' }], endText: '<i>' })
    expect(svg).toContain('>Fun &amp; &lt;b&gt;</text>')
    expect(svg).toContain('>&lt;i&gt;</text>')
    expect(svg).not.toContain('<b>')
  })
})

describe('sparkline', () => {
  it('draws the months as one small line, the latest dotted, the usual level dashed across', () => {
    const svg = spark()
    expect(svg).toContain('viewBox="0 0 3000 720"')
    expect(svg).toContain('<polyline points="60,60 1500,660 2940,360" fill="none"')
    expect(svg).toContain('<circle cx="2940" cy="360" r="60" fill="#2B5D6A" class="chart-trend-last"/>')
    expect(svg).toContain('<line x1="60" y1="180" x2="2940" y2="180" stroke="#A8A29E"')
  })

  it('leaves the usual level off when there is none, and dots no latest month that is a gap', () => {
    const svg = spark({ usualBp: null, pointsBp: [0, 10_000, null] })
    expect(svg).not.toContain('<line')
    expect(svg).not.toContain('chart-trend-last')
    expect(svg).toContain('<polyline points="60,660 1500,60"')
  })
})
