import { describe, expect, it } from 'vitest'
import { incomeBars, type IncomeBar } from '../src/bars.js'

/** Suite tests: lengths worked by hand on the 3,000-unit grid. */

const bar = (label: string, goalBp: number | null, actualBp: number | null): IncomeBar => ({
  label,
  valueText: '$1.00 of $2.00',
  goalBp,
  actualBp,
})
const chart = (bars: IncomeBar[]) => incomeBars({ id: 'income', title: 'Income against goals', description: 'd', bars })
/** Each bar row's rectangles, as [fill, width]. */
const rects = (svg: string) =>
  [...svg.matchAll(/<rect x="0" y="(\d+)" width="(\d+)" height="100" rx="40" fill="(#[0-9A-F]{6})"/g)].map((m) => [
    Number(m[1]),
    m[3],
    Number(m[2]),
  ])

describe('incomeBars', () => {
  it('writes an income name with < and & as text, never as a tag', () => {
    const svg = chart([bar('Tips & <cash>', 10_000, 5_000)])
    expect(svg).toContain('>Tips &amp; &lt;cash&gt;</text>')
    expect(svg).toContain('<title>Tips &amp; &lt;cash&gt;: $1.00 of $2.00</title>')
    expect(svg).not.toContain('<cash>')
  })

  it('draws each Actual over a track as long as its Goal, all on one scale', () => {
    // 5,700 of 5,700; 325 of 400, at 570 and 702 bp of the scale; a row
    // with no goal and nothing in yet.
    expect(rects(chart([bar('Pay', 10_000, 10_000), bar('Side', 702, 570), bar('Gift', null, 0)]))).toEqual([
      [390, '#CCE2DF', 3_000],
      [390, '#9ABDB7', 3_000],
      [730, '#CCE2DF', 211],
      [730, '#9ABDB7', 171],
    ])
  })

  it('runs an Actual past its track, and notches where the Goal ended', () => {
    const svg = chart([bar('Pay', 6_667, 10_000)])
    expect(rects(svg)).toEqual([
      [390, '#CCE2DF', 2_000],
      [390, '#9ABDB7', 3_000],
    ])
    expect(svg).toContain('<line x1="2000" y1="390" x2="2000" y2="490" stroke="#FFFEFA"')
    // An Actual that meets its Goal exactly ends where the track does: no notch.
    expect(chart([bar('Pay', 10_000, 10_000)])).not.toContain('<line')
  })

  it('shortens a name that would run into its figures', () => {
    // "$1.00 of $2.00" is 14 characters, 980 units; the name has 3,000 − 980
    // − 60 = 1,960, which is 28 characters at 70 each: 27 and "…".
    const svg = chart([bar('An income source with a long, long name', 10_000, 10_000)])
    expect(svg).toContain('>An income source with a lon…</text>')
  })

  it('draws no bar for money back out, and no track without a goal', () => {
    expect(rects(chart([bar('Pay', 10_000, null), bar('Side', null, 4_000)]))).toEqual([
      [390, '#CCE2DF', 3_000],
      [730, '#9ABDB7', 1_200],
    ])
    expect(chart([bar('Pay', 10_000, null)])).not.toContain('<line')
  })

  it('names Goal and Actual in a key, and makes room for every row', () => {
    const svg = chart([bar('Pay', 10_000, 10_000), bar('Side', 702, 570)])
    expect(svg).toContain('viewBox="0 0 3000 920"')
    expect(svg).toMatch(/fill="#CCE2DF" class="chart-income-goal"\/><text x="160" y="120" [^>]*>Goal</)
    expect(svg).toMatch(/>Actual<\/text>/)
    expect([...svg.matchAll(/<text x="0" y="(\d+)"/g)].map((m) => m[1])).toEqual(['340', '680'])
  })
})
