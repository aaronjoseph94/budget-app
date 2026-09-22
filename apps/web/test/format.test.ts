import { describe, expect, it } from 'vitest'
import { describeFailure, describeReason, formatCents, formatIsoDate } from '../src/format.js'

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
    // 0.29 and 8.70 are the classic float offenders. Formatting from the
    // integer means there is no float to be wrong.
    expect(formatCents(29)).toBe('$0.29')
    expect(formatCents(870)).toBe('$8.70')
    expect(formatCents(87029)).toBe('$870.29')
  })

  it('renders a negative zero as zero', () => {
    expect(formatCents(-0)).toBe('$0.00')
  })
})

describe('formatIsoDate', () => {
  it('renders a calendar date without going through Date', () => {
    expect(formatIsoDate('2025-03-04')).toBe('4 Mar 2025')
    expect(formatIsoDate('2025-12-31')).toBe('31 Dec 2025')
    expect(formatIsoDate('2024-02-29')).toBe('29 Feb 2024')
  })

  it('returns anything it cannot read unchanged, rather than inventing a date', () => {
    expect(formatIsoDate('nonsense')).toBe('nonsense')
    expect(formatIsoDate('2025-99-01')).toBe('2025-99-01')
  })
})

describe('reasons a person can act on', () => {
  it('turns every rejection code into a sentence', () => {
    // The enum is what the database stores; this is what the user reads.
    for (const code of [
      'row_shape_mismatch',
      'missing_amount',
      'unparseable_date',
      'invalid_merchant',
      'already_in_ledger',
    ]) {
      const text = describeReason(code)
      expect(text.length).toBeGreaterThan(10)
      expect(text).not.toContain('_')
    }
  })

  it('has a fallback rather than showing a raw code to a person', () => {
    expect(describeReason('some_future_code')).toBe('This row could not be read.')
  })

  it('names the line of a file-level failure when it has one', () => {
    expect(describeFailure('unterminated_quote', 7)).toContain('line 7')
    expect(describeFailure('unterminated_quote')).not.toContain('line')
  })
})
