import { describe, expect, it } from 'vitest'
import { shareRing, yearPie, type PieSlice } from '../src/pie.js'

/** Suite tests: coordinates worked by hand on the 3,000-unit grid, pie centred at (1500, 840), radius 800. */

const slice = (label: string, shareBp: number | null): PieSlice => ({ label, valueText: `v${shareBp}`, shareBp })
const pie = (slices: PieSlice[], palette: 'annual' | 'home' = 'annual') =>
  yearPie({ id: 'pie', title: 'Income, expenses and savings', description: 'The year.', palette, slices })
const paths = (svg: string) => [...svg.matchAll(/<path d="([^"]+)" fill="(#[0-9A-F]{6})"/g)].map((m) => [m[1], m[2]])

describe('yearPie', () => {
  it("draws each part clockwise from twelve o'clock to the centre, in Annual's colours by position", () => {
    expect(paths(pie([slice('Income', 2_500), slice('Expenses', 7_500), slice('Savings', null)]))).toEqual([
      ['M1500 40A800 800 0 0 1 2300 840L1500 840Z', '#D7EEEB'],
      ['M2300 840A800 800 0 1 1 1500 40L1500 840Z', '#F9D7D2'],
    ])
  })

  it('names all three in the legend, a part with no slice too, in readable inks', () => {
    const svg = pie([slice('Income', 10_000), slice('Expenses', null), slice('Savings & <more>', null)])
    const texts = [...svg.matchAll(/<text [^>]*fill="(#[0-9A-F]{6})"[^>]*>([^<]*)<\/text>/g)].map((m) => [m[2], m[1]])
    expect(texts).toEqual([
      ['Income', '#4F6E69'], ['v10000', '#4F6E69'],
      ['Expenses', '#A63428'], ['vnull', '#A63428'],
      ['Savings &amp; &lt;more&gt;', '#7C5512'], ['vnull', '#7C5512'],
    ])
    // All of it is a whole circle, drawn as two halves.
    expect(paths(svg)[0]![0]).toBe('M1500 40A800 800 0 0 1 1500 1640 A800 800 0 0 1 1500 40 Z')
  })

  it("outlines Home's pastel slices in Home's label colours", () => {
    const svg = pie([slice('Income', 5_000), slice('Expenses', 3_000), slice('Savings', 2_001)], 'home')
    const edges = [...svg.matchAll(/fill="(#[0-9A-F]{6})" stroke="(#[0-9A-F]{6})"/g)].map((m) => [m[1], m[2]])
    expect(edges).toEqual([
      ['#D4F8E8', '#36976E'],
      ['#FFDCE1', '#D66375'],
      ['#FFECD9', '#FFD05C'],
    ])
    // Half-up shares add to 10,001; the last slice stops at the whole.
    expect(paths(svg)[2]![0]).toMatch(/1500 40L1500 840Z$/)
  })

  it('refuses anything but three parts', () => {
    expect(() => pie([slice('Income', 10_000)])).toThrow(RangeError)
  })
})

describe('shareRing', () => {
  const ring = (shareBp: number, rank = 0) =>
    shareRing({ id: 'top1', title: 'Rent', description: 'Rent: 57% of spending.', shareBp, rank, centreText: '25%' })

  it("draws the share in its rank's colour over the whole track, hole 75%", () => {
    expect(paths(ring(2_500))).toEqual([
      [
        'M1500 100A1400 1400 0 0 1 1500 2900 A1400 1400 0 0 1 1500 100 Z M1500 450A1050 1050 0 0 1 1500 2550 A1050 1050 0 0 1 1500 450 Z',
        '#F3F5F6',
      ],
      ['M1500 100A1400 1400 0 0 1 2900 1500L2550 1500A1050 1050 0 0 0 1500 450Z', '#FFAC9E'],
    ])
    expect(ring(2_500)).toContain('>25%</text>')
  })

  it('draws the track alone for no share, and refuses a fourth rank', () => {
    expect(paths(ring(0, 2)).map((p) => p[1])).toEqual(['#F3F5F6'])
    expect(paths(ring(100, 1)).map((p) => p[1])).toEqual(['#F3F5F6', '#A9D4D4'])
    expect(() => ring(100, 3)).toThrow(RangeError)
  })
})
