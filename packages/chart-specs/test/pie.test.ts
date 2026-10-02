import { describe, expect, it } from 'vitest'
import { debtRing, shareRing, yearPie, type PieSlice } from '../src/pie.js'

/** Suite tests: coordinates worked by hand on the 3,000-unit grid, pie centred at (1500, 840), radius 800. */

const slice = (label: string, shareBp: number | null): PieSlice => ({ label, valueText: `v${shareBp}`, shareBp })
const pie = (slices: PieSlice[]) => yearPie({ id: 'pie', title: 'Income, expenses and savings', description: 'The year.', slices })
const paths = (svg: string) => [...svg.matchAll(/<path d="([^"]+)" fill="(#[0-9A-F]{6})"/g)].map((m) => [m[1], m[2]])

describe('yearPie', () => {
  it("draws each part clockwise from twelve o'clock to the centre, in Mockup A's colours by position", () => {
    expect(paths(pie([slice('Income', 2_500), slice('Expenses', 7_500), slice('Savings', null)]))).toEqual([
      ['M1500 40A800 800 0 0 1 2300 840L1500 840Z', '#10B981'],
      ['M2300 840A800 800 0 1 1 1500 40L1500 840Z', '#9CA3AF'],
    ])
  })

  it('names all three in the legend, a part with no slice too, in readable inks', () => {
    const svg = pie([slice('Income', 10_000), slice('Expenses', null), slice('Savings & <more>', null)])
    const texts = [...svg.matchAll(/<text [^>]*fill="(#[0-9A-F]{6})"[^>]*>([^<]*)<\/text>/g)].map((m) => [m[2], m[1]])
    expect(texts).toEqual([
      ['Income', '#047857'], ['v10000', '#047857'],
      ['Expenses', '#374151'], ['vnull', '#374151'],
      ['Savings &amp; &lt;more&gt;', '#B45309'], ['vnull', '#B45309'],
    ])
    // All of it is a whole circle, drawn as two halves.
    expect(paths(svg)[0]![0]).toBe('M1500 40A800 800 0 0 1 1500 1640 A800 800 0 0 1 1500 40 Z')
  })

  it("parts each slice by a line in the card's colour", () => {
    const svg = pie([slice('Income', 5_000), slice('Expenses', 3_000), slice('Savings', 2_001)])
    const edges = [...svg.matchAll(/fill="(#[0-9A-F]{6})" stroke="(#[0-9A-F]{6})"/g)].map((m) => [m[1], m[2]])
    expect(edges).toEqual([
      ['#10B981', '#FFFFFF'],
      ['#9CA3AF', '#FFFFFF'],
      ['#F59E0B', '#FFFFFF'],
    ])
    expect(svg).toContain('class="chart-pie-0 chart-surface-gap"')
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
        '#E5E7EB',
      ],
      ['M1500 100A1400 1400 0 0 1 2900 1500L2550 1500A1050 1050 0 0 0 1500 450Z', '#F97316'],
    ])
    expect(ring(2_500)).toContain('>25%</text>')
  })

  it('draws the track alone for no share, and refuses a fourth rank', () => {
    expect(paths(ring(0, 2)).map((p) => p[1])).toEqual(['#E5E7EB'])
    expect(paths(ring(100, 1)).map((p) => p[1])).toEqual(['#E5E7EB', '#EC4899'])
    expect(() => ring(100, 3)).toThrow(RangeError)
  })
})

describe('debtRing', () => {
  const ring = (paidBp: number) => debtRing({ id: 'debt', title: 'Car loan', description: 'Car loan: 25% paid.', paidBp, centreText: '25%' })

  it("draws what is paid over a ring of what is left, in Mockup A's accent, hole 50% (D25)", () => {
    expect(paths(ring(2_500))).toEqual([
      [
        'M1500 100A1400 1400 0 0 1 1500 2900 A1400 1400 0 0 1 1500 100 Z M1500 800A700 700 0 0 1 1500 2200 A700 700 0 0 1 1500 800 Z',
        '#E5E7EB',
      ],
      ['M1500 100A1400 1400 0 0 1 2900 1500L2200 1500A700 700 0 0 0 1500 800Z', '#4F46E5'],
    ])
    expect(ring(2_500)).toContain('class="chart-debt-ink">25%</text>')
  })

  it('draws what is left alone with nothing paid, and all paid as one ring', () => {
    expect(paths(ring(0)).map((p) => p[1])).toEqual(['#E5E7EB'])
    expect(paths(ring(10_000))[1]?.[0]).toBe(paths(ring(10_000))[0]?.[0])
  })
})
