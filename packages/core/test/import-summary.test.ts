import { describe, expect, it } from 'vitest'
import { summariseImport, summariseImportWithin } from '../src/index.js'

describe('summariseImport', () => {
  it('separates the two directions by sign, not by list', () => {
    const s = summariseImport({ amountsCents: [-450, -4000, 250000, -1234] })
    expect(s.count).toBe(4)
    expect(s.inflowCents).toBe(250000)
    expect(s.outflowCents).toBe(-5684)
    expect(s.netCents).toBe(244316)
  })

  it('reports a net loss as a negative, rather than as a magnitude', () => {
    // A screen that showed the magnitude would have to remember the sign
    // itself, which is exactly the arithmetic the UI must not do.
    const s = summariseImport({ amountsCents: [-450, -4000] })
    expect(s.netCents).toBe(-4450)
    expect(s.inflowCents).toBe(0)
  })

  it('returns zeroes for an empty import rather than failing', () => {
    // An import where every row was rejected is a real outcome with a real
    // total, and that total is zero.
    const s = summariseImport({ amountsCents: [] })
    expect(s).toEqual({ count: 0, netCents: 0, inflowCents: 0, outflowCents: 0 })
  })

  it('counts a zero amount without letting it change a direction', () => {
    const s = summariseImport({ amountsCents: [0, -100] })
    expect(s.count).toBe(2)
    expect(s.inflowCents).toBe(0)
    expect(s.outflowCents).toBe(-100)
  })

  it('refuses a fractional amount rather than rounding it', () => {
    expect(() => summariseImport({ amountsCents: [1.5] })).toThrow(RangeError)
  })
})

describe('summariseImportWithin', () => {
  // A statement's preview adds up every row it read while the screen draws.
  // Rows each within a transaction's limit can still add up past the
  // largest whole number of cents, and the screen must not throw for it.
  const AT_LIMIT = -99_999_999_999

  it('is the summary when the rows can be added up', () => {
    expect(summariseImportWithin({ amountsCents: [-450, 250000] })).toEqual(summariseImport({ amountsCents: [-450, 250000] }))
  })

  it('says too large, rather than throwing, when they cannot', () => {
    const amountsCents = Array.from({ length: 90_073 }, () => AT_LIMIT)
    expect(() => summariseImport({ amountsCents })).toThrow(RangeError)
    expect(summariseImportWithin({ amountsCents })).toBe('too_large')
  })

  it('says too large when one direction cannot be added up, though the net is zero', () => {
    const out = Array.from({ length: 90_073 }, () => AT_LIMIT)
    expect(summariseImportWithin({ amountsCents: [...out, ...out.map((a) => -a)] })).toBe('too_large')
  })
})
