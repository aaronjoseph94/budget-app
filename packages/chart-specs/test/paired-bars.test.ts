import { describe, expect, it } from 'vitest'
import { pairedBars, type PairedBarsInput } from '../src/paired-bars.js'

/** Suite tests: places worked by hand on the 3,000-unit grid; bars run 2,100 units, leaving 900 for the amount. */

const chart = (over: Partial<PairedBarsInput> = {}) =>
  pairedBars({
    id: 'paired',
    title: 'August against July',
    description: 'd',
    nowName: 'August',
    beforeName: 'July',
    rows: [
      { label: 'Dining out', nowText: '$560.00', beforeText: '$450.00', nowBp: 10_000, beforeBp: 8_036 },
      { label: 'Coffee', nowText: '−$4.00', beforeText: '$12.00', nowBp: 0, beforeBp: 500 },
    ],
    ...over,
  })

describe('pairedBars', () => {
  it('draws this month above last month for each row, on one scale, each amount at its bar’s end', () => {
    const svg = chart()
    // Row one from 220: the label at 340, this month at 390, last month at 520; 8,036 bp of 2,100 is 1,688.
    expect(svg).toContain('<text x="0" y="340" fill="#6B7280" class="chart-forecast-ink">Dining out</text>')
    expect(svg).toContain('<rect x="0" y="390" width="2100" height="100" rx="40" fill="#4F46E5" class="chart-report-now"/>')
    expect(svg).toContain('<text x="2160" y="480"')
    expect(svg).toContain('<rect x="0" y="520" width="1688" height="100" rx="40" fill="#A7A3F2" class="chart-report-before"/>')
    expect(svg).toContain('<text x="1748" y="610"')
    expect(svg).toContain('viewBox="0 0 3000 1160"')
  })

  it('draws no bar for a figure at or below $0, and still writes its amount', () => {
    // Row two from 680: this month has no bar, its amount at 60; 500 bp of 2,100 is 105.
    const svg = chart()
    expect(svg).toContain('<text x="60" y="940"')
    expect(svg).toContain('>−$4.00</text>')
    expect(svg).toContain('<rect x="0" y="980" width="105" height="100"')
    expect(svg.match(/class="chart-report-now"/g)).toHaveLength(2)
  })

  it('names both bars in a key and in each row’s title, so colour is never the only way to tell them apart', () => {
    const svg = chart()
    expect(svg).toContain('>August</text>')
    expect(svg).toContain('>July</text>')
    expect(svg).toContain('<title>Dining out: August $560.00, July $450.00</title>')
  })

  it('writes every text as text, never as markup', () => {
    const svg = chart({ nowName: '<i>', rows: [{ label: '<b>&', nowText: '$1', beforeText: '$2', nowBp: 0, beforeBp: 0 }] })
    expect(svg).toContain('&lt;b&gt;&amp;')
    expect(svg).toContain('&lt;i&gt;')
    expect(svg).not.toContain('<b>')
  })
})
