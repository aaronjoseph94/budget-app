import { describe, expect, it } from 'vitest'
import { scaleSeries } from '../src/index.js'

/** Suite tests, worked by hand: a chart's heights, so no chart divides money (plan §7). */

describe('scaleSeries', () => {
  it('puts each value between the lowest (0) and the highest (10,000), half-up', () => {
    // Span 3,000.00 − 1,000.00 = 2,000.00: 1,500.00 is a quarter, 2,500 bp;
    // 1,333.33 is 1,666.65 bp, 1,667.
    expect(scaleSeries({ values: [100_000, 150_000, 300_000, 133_333] })).toEqual({ bps: [0, 2_500, 10_000, 1_667], zeroBp: null, lowCents: 100_000, highCents: 300_000 })
  })

  it('places zero when the values cross it', () => {
    // −1,000.00 to 3,000.00: zero is a quarter of the way up.
    expect(scaleSeries({ values: [-100_000, 300_000] })).toMatchObject({ bps: [0, 10_000], zeroBp: 2_500 })
    expect(scaleSeries({ values: [0, 300_000] }).zeroBp).toBe(0)
  })

  it('draws a flat series across the middle, and nothing for no values', () => {
    expect(scaleSeries({ values: [50_000, 50_000] })).toEqual({ bps: [5_000, 5_000], zeroBp: null, lowCents: 50_000, highCents: 50_000 })
    expect(scaleSeries({ values: [] })).toEqual({ bps: [], zeroBp: null, lowCents: null, highCents: null })
  })

  it('refuses a fraction of a cent', () => {
    expect(() => scaleSeries({ values: [1.5] })).toThrow(RangeError)
  })
})
