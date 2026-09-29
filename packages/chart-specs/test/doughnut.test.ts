import { describe, expect, it } from 'vitest'
import { hueFor, spendingDoughnut, type DoughnutSlice } from '../src/doughnut.js'

/** Suite tests: coordinates worked by hand on the 3,000-unit grid, ring centred at (1500, 720). */

const slice = (label: string, shareBp: number, listIndex: number): DoughnutSlice => ({
  label,
  valueText: `$${shareBp} · x%`,
  shareBp,
  listIndex,
})
const chart = (slices: DoughnutSlice[]) =>
  spendingDoughnut({ id: 'spend', title: 'Variable expenses by category', description: 'Where it went.', slices })
const paths = (svg: string) => [...svg.matchAll(/<path d="([^"]+)" fill="(#[0-9A-F]{6})"/g)].map((m) => [m[1], m[2]])

describe('spendingDoughnut', () => {
  it('writes a category name with < and & as text in the legend and the slice title', () => {
    const svg = chart([slice('Fun & <Games>', 10_000, 0)])
    expect(svg).toContain('>Fun &amp; &lt;Games&gt;</text>')
    expect(svg).toContain('<title>Fun &amp; &lt;Games&gt;: $10000 · x%</title>')
    expect(svg).not.toContain('<Games>')
  })

  it('is its title and description, then the ring, then a legend row per category', () => {
    const svg = chart([slice('a', 10_000, 0), slice('b', 0, 1)])
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 3000 1980" [^>]*aria-labelledby="spend-title" aria-describedby="spend-desc"/)
    expect(svg).toContain('<title id="spend-title">Variable expenses by category</title><desc id="spend-desc">')
    expect([...svg.matchAll(/<text x="160" y="(\d+)"/g)].map((m) => m[1])).toEqual(['1540', '1740'])
  })

  it("draws each slice clockwise from twelve o'clock, the long way round past half", () => {
    // A quarter: from the top to three o'clock, outer radius 700, hole 350.
    expect(paths(chart([slice('a', 2_500, 0), slice('b', 7_500, 1)]))).toEqual([
      ['M1500 20A700 700 0 0 1 2200 720L1850 720A350 350 0 0 0 1500 370Z', '#F97316'],
      ['M2200 720A700 700 0 1 1 1500 20L1500 370A350 350 0 1 0 1850 720Z', '#EC4899'],
    ])
  })

  // An arc from a point back to itself draws nothing.
  it('draws one category with all of it as two half rings, holed', () => {
    expect(paths(chart([slice('a', 10_000, 9)]))).toEqual([
      [
        'M1500 20A700 700 0 0 1 1500 1420 A700 700 0 0 1 1500 20 Z M1500 370A350 350 0 0 1 1500 1070 A350 350 0 0 1 1500 370 Z',
        '#3B82F6',
      ],
    ])
  })

  // Half-up shares can add to 10,001 (F17); the ring stops at the whole.
  it('stops at the whole when rounded shares add to a basis point over it', () => {
    // The first is too thin to show on the grid; the second, from 1 bp to the
    // whole, starts and ends on the same point and is drawn whole.
    const [first, second] = paths(chart([slice('a', 1, 0), slice('b', 10_000, 1)]))
    expect(first![0]).toBe('M1500 20A700 700 0 0 1 1500 20L1500 370A350 350 0 0 0 1500 370Z')
    expect(second![0]).toMatch(/^M1500 20A700 700 0 0 1 1500 1420 A/)
  })

  // Two halves: neither is the long way round, and a second half rounded up
  // a basis point (F17) still ends at twelve o'clock, not past it.
  it('draws two halves the short way round, stopping the second at the whole', () => {
    expect(paths(chart([slice('a', 5_000, 0), slice('b', 5_001, 1)])).map(([d]) => d)).toEqual([
      'M1500 20A700 700 0 0 1 1500 1420L1500 1070A350 350 0 0 0 1500 370Z',
      'M1500 1420A700 700 0 0 1 1500 20L1500 370A350 350 0 0 0 1500 1070Z',
    ])
  })

  it('shortens a legend name that would run into its amount', () => {
    // "$10000 · x%" is 11 characters, 770 units; the name has 3,000 − 100 −
    // 60 − 770 − 60 = 2,010, which is 28 characters at 70 each: 27 and "…".
    const svg = chart([slice('A category name far too long to sit beside its amount', 10_000, 0)])
    expect(svg).toContain('>A category name far too lon…</text>')
  })

  it('names a category with too small a share to draw, and draws no slice for it', () => {
    const svg = chart([slice('tiny', 0, 3), slice('rest', 10_000, 4)])
    expect(paths(svg)).toHaveLength(1)
    expect(svg).toContain('>tiny</text>')
  })

  it('draws the empty ring and no legend with nothing to share', () => {
    const svg = chart([])
    expect(svg).toContain('fill="#FFEDD5" class="chart-variable-track"')
    expect(svg).not.toContain('<text')
  })
})

describe('hueFor', () => {
  // By row, as Jan chart13 colours, in Mockup A's six hues (N124).
  it("takes Mockup A's hue for the row, and starts again after the sixth", () => {
    const expected = ['#F97316', '#EC4899', '#8B5CF6', '#3B82F6', '#14B8A6', '#22C55E', '#F97316', '#3B82F6']
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(hueFor)).toEqual(expected)
    expect(() => hueFor(-1)).toThrow(RangeError)
  })
})
