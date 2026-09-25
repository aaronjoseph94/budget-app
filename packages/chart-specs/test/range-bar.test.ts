import { describe, expect, it } from 'vitest'
import { rangeBar, type RangeBarInput } from '../src/range-bar.js'

/** Suite tests: places worked by hand on the 3,000-unit grid, 80 units in from each side (2,840 across). */

const chart = (over: Partial<RangeBarInput> = {}) =>
  rangeBar({
    id: 'month-end',
    title: 'Where September ends',
    description: 'd',
    lowBp: 0,
    midBp: 5_000,
    highBp: 10_000,
    todayBp: 2_500,
    zeroBp: null,
    midText: 'About $3,310',
    todayText: 'Today $1,760.00',
    ...over,
  })

describe('rangeBar', () => {
  it('draws the range as a bar with a notch at its most likely end, and today as a dot', () => {
    // 0 bp at 80, 5,000 at 80 + 1,420 = 1,500, 10,000 at 2,920; today 2,500 at 790.
    const svg = chart()
    expect(svg).toContain('<rect x="80" y="260" width="2840" height="120" rx="60" fill="#2B5D6A" class="chart-forecast-range"/>')
    expect(svg).toContain('<line x1="1500" y1="260" x2="1500" y2="380" stroke="#FFFEFA"')
    expect(svg).toContain('<circle cx="790" cy="320" r="50"')
    expect(svg).toContain('viewBox="0 0 3000 640"')
  })

  it('keeps each label inside the chart: from its left near the left edge, centred in the middle', () => {
    const svg = chart()
    expect(svg).toContain('<text x="710" y="160" text-anchor="start"')
    expect(svg).toContain('<text x="1500" y="600" text-anchor="middle"')
    expect(chart({ midBp: 9_500 })).toContain('<text x="2858" y="600" text-anchor="end"')
  })

  it('draws one rough figure as a short bar with no notch', () => {
    // 6,000 bp at 80 + 1,704 = 1,784; the bar is 120 wide, centred there.
    const svg = chart({ lowBp: 6_000, midBp: 6_000, highBp: 6_000 })
    expect(svg).toContain('<rect x="1724" y="260" width="120" height="120"')
    expect(svg).not.toContain('stroke="#FFFEFA" stroke-width="20"')
  })

  it('marks $0 when it is on the scale, and leaves today out when not given', () => {
    // 2,000 bp at 80 + 568 = 648.
    expect(chart({ zeroBp: 2_000 })).toContain('<line x1="648" y1="220" x2="648" y2="420"')
    expect(chart({ todayBp: null, todayText: null })).not.toContain('<circle')
  })

  it('writes every text as text, never as markup', () => {
    const svg = chart({ title: 'Ends <b>& more', midText: 'About <b>&' })
    expect(svg).toContain('>Ends &lt;b&gt;&amp; more</title>')
    expect(svg).toContain('>About &lt;b&gt;&amp;</text>')
    expect(svg).not.toContain('<b>')
  })
})
