import { describe, expect, it } from 'vitest'
import { mad, median, quantile } from '../src/index.js'

// Every figure worked by hand (F27, docs/formula-decisions.md).
describe('median', () => {
  it('is the middle value of an odd count, in any order', () => {
    expect(median({ values: [51_000, 30_000, 42_000] })).toBe(42_000)
    expect(median({ values: [7] })).toBe(7)
  })

  it('halves the middle two of an even count, half-up on the magnitude', () => {
    // March to August's Dining out: the middle two are 39,000 and 42,000.
    expect(median({ values: [30_000, 42_000, 36_000, 51_000, 39_000, 45_000] })).toBe(40_500)
    // (1 + 2) ÷ 2 = 1.5 rounds to 2; (−1 + −2) ÷ 2 = −1.5 rounds to −2, the sign kept.
    expect(median({ values: [2, 1] })).toBe(2)
    expect(median({ values: [-2, -1] })).toBe(-2)
    expect(median({ values: [-1, 0] })).toBe(-1)
  })

  it('is none for no values', () => {
    expect(median({ values: [] })).toBeNull()
  })

  it('refuses a value that is not a whole number', () => {
    expect(() => median({ values: [1, 2.5] })).toThrow(RangeError)
  })

  it('stays exact where the middle two add past a double', () => {
    const big = Number.MAX_SAFE_INTEGER
    expect(median({ values: [big, big] })).toBe(big)
  })
})

describe('quantile, by nearest rank', () => {
  const months = [30_000, 42_000, 36_000, 51_000, 39_000, 45_000]

  it('is the value at rank ⌈p × n ÷ 10000⌉ of the sorted list', () => {
    // p25 of 6: ⌈1.5⌉ = rank 2 → 36,000. Median: rank 3 → 39,000. p75: ⌈4.5⌉ = 5 → 45,000.
    expect(quantile({ values: months, pBp: 2_500 })).toBe(36_000)
    expect(quantile({ values: months, pBp: 5_000 })).toBe(39_000)
    expect(quantile({ values: months, pBp: 7_500 })).toBe(45_000)
    expect(quantile({ values: months, pBp: 10_000 })).toBe(51_000)
  })

  it('never falls below rank 1', () => {
    expect(quantile({ values: months, pBp: 1 })).toBe(30_000)
  })

  it('is none for no values, and refuses a share outside 1 to 10,000 basis points', () => {
    expect(quantile({ values: [], pBp: 5_000 })).toBeNull()
    expect(() => quantile({ values: months, pBp: 0 })).toThrow(RangeError)
    expect(() => quantile({ values: months, pBp: 10_001 })).toThrow(RangeError)
    expect(() => quantile({ values: months, pBp: 2_500.5 })).toThrow(RangeError)
  })
})

describe('mad, the median absolute deviation', () => {
  it('is the median of each value’s distance from the median', () => {
    // Median 40,500; distances 10,500 1,500 4,500 10,500 1,500 4,500; their median 4,500.
    expect(mad({ values: [30_000, 42_000, 36_000, 51_000, 39_000, 45_000] })).toBe(4_500)
    // Median 5; distances 4, 0, 5: median 4.
    expect(mad({ values: [1, 5, 10] })).toBe(4)
  })

  it('is 0 for one value, and none for no values', () => {
    expect(mad({ values: [12_345] })).toBe(0)
    expect(mad({ values: [] })).toBeNull()
  })
})
