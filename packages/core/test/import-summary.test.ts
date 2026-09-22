import { describe, expect, it } from 'vitest'
import { summariseImport } from '../src/index.js'

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
