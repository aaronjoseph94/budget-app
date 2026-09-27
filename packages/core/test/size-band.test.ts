import { describe, expect, it } from 'vitest'
import { sizeBand } from '../src/index.js'

/** Suite tests, worked by hand from F46 (docs/formula-decisions.md). */
describe('sizeBand says spent or received, and how big, never how much (F46)', () => {
  it.each([
    [-450, 'spent', 'small'],
    [-1_999, 'spent', 'small'],
    [-2_000, 'spent', 'medium'],
    [-9_999, 'spent', 'medium'],
    [-10_000, 'spent', 'large'],
    [210_000, 'received', 'large'],
    [2_000, 'received', 'medium'],
    [0, 'received', 'small'],
  ])('%i cents is %s, %s', (amountCents, flow, size) => {
    expect(sizeBand({ amountCents })).toEqual({ flow, size })
  })

  it('refuses an amount that is not whole cents', () => {
    expect(() => sizeBand({ amountCents: -4.5 })).toThrow()
  })
})
