import { describe, expect, it } from 'vitest'
import { formatCents } from '../src/index.js'

// The app's own cases (apps/web/test/format.test.ts), where it now re-exports this.
describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [7, '$0.07'],
    [29, '$0.29'],
    [450, '$4.50'],
    [-450, '-$4.50'],
    [123456, '$1,234.56'],
    [-123456, '-$1,234.56'],
    [123456789, '$1,234,567.89'],
    [100, '$1.00'],
    [-1, '-$0.01'],
  ])('renders %i cents as %s', (amount, expected) => {
    expect(formatCents(amount)).toBe(expected)
  })

  it('is exact where a float round-trip is not', () => {
    expect(formatCents(29)).toBe('$0.29')
    expect(formatCents(870)).toBe('$8.70')
    expect(formatCents(87029)).toBe('$870.29')
  })

  it('renders a negative zero as zero', () => {
    expect(formatCents(-0)).toBe('$0.00')
  })
})

describe('formatCents, given something that is not whole cents (architecture-a-09)', () => {
  // It printed these as amounts: "$0.12.5", "$0.0.30000000000000004",
  // "$NaN.NaN" and "-$0.0.5".
  it.each([[12.5], [0.1 + 0.2], [Number.NaN], [-0.5], [Number.POSITIVE_INFINITY], [2 ** 53]])('refuses %s', (amount) => {
    expect(() => formatCents(amount)).toThrow(new RangeError('formatCents takes whole cents'))
  })
})

