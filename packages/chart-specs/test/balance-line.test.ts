import { describe, expect, it } from 'vitest'
import { balanceLine, type BalanceLineInput } from '../src/balance-line.js'

/** Suite tests: places worked by hand on the 3,000-unit grid, 80 in from each side, the plot 1,200 tall from 280. */

const chart = (over: Partial<BalanceLineInput> = {}) =>
  balanceLine({
    id: 'next-30',
    title: 'The next 30 days',
    description: 'd',
    pointsBp: [10_000, 0, 5_000],
    zeroBp: null,
    lowestIndex: 1,
    lowestText: '8 Oct: $2,032.52',
    startText: 'Today',
    endText: '24 Oct',
    ...over,
  })

describe('balanceLine', () => {
  it('spreads the days evenly across and raises each by its place', () => {
    // Three days at 80, 1,500 and 2,920; 10,000 bp at 280, 0 at 1,480, 5,000 at 880.
    const svg = chart()
    expect(svg).toContain('<polyline points="80,280 1500,1480 2920,880" fill="none" stroke="#2B5D6A"')
    // The axis's names sit a row under the tightest day's name: 1,880, and 60 below.
    expect(svg).toContain('viewBox="0 0 3000 1940"')
  })

  // Under its point, where the line never goes: it is the lowest. Over
  // it, the name crossed the line where it rose steeply the next day (N86).
  it('marks and names the tightest day, under its point', () => {
    const svg = chart()
    expect(svg).toContain('<circle cx="1500" cy="1480" r="50" fill="#B83A3A" class="chart-forecast-low"/>')
    expect(svg).toContain('<text x="1500" y="1700" text-anchor="middle"')
    expect(svg).toContain('>8 Oct: $2,032.52</text>')
    expect(chart({ lowestIndex: null })).not.toContain('<circle')
  })

  it('keeps 31 days on whole units, and names the first and the last', () => {
    // Day 30 of 30 steps is at 80 + 2,840; day 1 at 80 + 94.67, 175.
    const svg = chart({ pointsBp: Array.from({ length: 31 }, () => 5_000), lowestIndex: 0 })
    expect(svg).toMatch(/points="80,880 175,880 [^"]* 2920,880"/)
    // Today's own name, at 880 + 220, is on a row of its own above them.
    expect(svg).toContain('<text x="0" y="1100" text-anchor="start"')
    expect(svg).toContain('<text x="80" y="1880" fill="#5B6773" class="chart-forecast-ink">Today</text>')
    expect(svg).toContain('<text x="2920" y="1880" text-anchor="end" fill="#5B6773" class="chart-forecast-ink">24 Oct</text>')
    // With no day named there is no row for it.
    expect(chart({ lowestIndex: null })).toContain('<text x="80" y="1700" fill="#5B6773" class="chart-forecast-ink">Today</text>')
  })

  it('draws $0 as a dashed rule when the line reaches it, and one day as a point', () => {
    expect(chart({ zeroBp: 2_500 })).toContain('<line x1="80" y1="1180" x2="2920" y2="1180"')
    expect(chart({ pointsBp: [5_000], lowestIndex: 0 })).toContain('<polyline points="80,880"')
  })

  it('writes every text as text, never as markup', () => {
    const svg = chart({ lowestText: 'Low <b>&', endText: '<i>' })
    expect(svg).toContain('>Low &lt;b&gt;&amp;</text>')
    expect(svg).toContain('>&lt;i&gt;</text>')
    expect(svg).not.toContain('<b>')
  })
})
