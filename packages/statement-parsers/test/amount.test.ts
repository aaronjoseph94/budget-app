import { describe, expect, it } from 'vitest'
import { cents } from '@budget/money-primitives'
import {
  US_AMOUNT_FORMAT,
  applySignConvention,
  parseTypedAmount,
  parseAmountToCents,
  type AmountFormat,
} from '../src/index.js'

const EU: AmountFormat = { decimalSeparator: ',', parenthesesMeanNegative: true }

const parsed = (raw: string, format: AmountFormat = US_AMOUNT_FORMAT) =>
  parseAmountToCents(raw, format)

describe('parseAmountToCents', () => {
  it.each([
    ['a plain decimal', '12.34', 1234],
    ['a leading dollar sign', '$12.34', 1234],
    ['thousands separators', '$1,234.56', 123456],
    ['a negative', '-12.34', -1234],
    ['a signed thousand', '-$1,234.56', -123456],
    ['an explicit plus', '+12.34', 1234],
    ['no decimal part', '1234', 123400],
    ['one decimal place', '12.3', 1230],
    ['zero', '0.00', 0],
    ['surrounding whitespace', '  12.34  ', 1234],
    ['a large balance', '1,234,567.89', 123456789],
  ])('reads %s', (_label, raw, expected) => {
    expect(parsed(raw)).toEqual({ ok: true, value: cents(expected) })
  })

  it('reads the accounting convention for a negative', () => {
    // Exports from accounting systems write a credit as (1,234.56).
    expect(parsed('(1,234.56)')).toEqual({ ok: true, value: cents(-123456) })
    expect(parsed('($12.34)')).toEqual({ ok: true, value: cents(-1234) })
  })

  it('leaves parentheses alone when the format says they are not negative', () => {
    const noParens: AmountFormat = { decimalSeparator: '.', parenthesesMeanNegative: false }
    expect(parsed('(12.34)', noParens).ok).toBe(false)
  })

  it('never produces a float, even for the classic offender', () => {
    // parseFloat('0.29') * 100 is 28.999999999999996. This must be exactly 29.
    expect(parsed('0.29')).toEqual({ ok: true, value: cents(29) })
    expect(parsed('1.10')).toEqual({ ok: true, value: cents(110) })
    expect(parsed('0.07')).toEqual({ ok: true, value: cents(7) })
    expect(parsed('870.29')).toEqual({ ok: true, value: cents(87029) })
  })

  it('reads a European statement when told the format', () => {
    expect(parsed('1.234,56', EU)).toEqual({ ok: true, value: cents(123456) })
    expect(parsed('12,34', EU)).toEqual({ ok: true, value: cents(1234) })
  })

  it('does not guess between the two conventions', () => {
    // "1.234" is 1234 in Berlin and 1.234 in Boston. The separator is declared,
    // never sniffed, because guessing is how an import is wrong by 1000x.
    expect(parsed('1.234', US_AMOUNT_FORMAT).ok).toBe(false) // 3 decimals: rejected
    expect(parsed('1.234', EU)).toEqual({ ok: true, value: cents(123400) }) // grouping
  })

  it.each([
    ['empty', ''],
    ['only whitespace', '   '],
  ])('reports %s as a missing amount, not as zero', (_label, raw) => {
    // A row that quietly became zero is indistinguishable from a refund.
    expect(parsed(raw)).toEqual({ ok: false, reason: 'missing_amount' })
  })

  it.each([
    ['letters', 'twelve dollars'],
    ['a stray word', '12.34 USD PENDING'],
    ['more than two decimals', '12.345'],
    ['a trailing separator', '12.'],
    ['two decimal points', '1.2.3'],
    ['a lone minus', '-'],
    ['a double negative', '-(12.34)'],
    ['an unclosed parenthesis', '(12.34'],
    ['nothing before the point', '.34'],
    ['beyond safe integer range', '99999999999999999999.99'],
  ])('rejects %s for the review queue', (_label, raw) => {
    expect(parsed(raw)).toEqual({ ok: false, reason: 'unparseable_amount' })
  })

  it('rejects a misdeclared format instead of silently multiplying by 100', () => {
    // "12,34" is twelve euros thirty-four. Read under US_AMOUNT_FORMAT the
    // comma looks like grouping, and stripping it yields $1,234.00 — a whole
    // ledger 100x wrong with every row reporting ok. A group of two digits is
    // not legal grouping, so it goes to the review queue instead.
    expect(parsed('12,34')).toEqual({ ok: false, reason: 'unparseable_amount' })
    expect(parsed('12.34', EU)).toEqual({ ok: false, reason: 'unparseable_amount' })
    expect(parsed('1,23')).toEqual({ ok: false, reason: 'unparseable_amount' })
  })

  it.each([
    ['a group of two', '1,23'],
    ['single-digit groups', '1,2,3'],
    ['four digits before the first separator', '1234,567'],
    ['a trailing separator', '1,234,'],
    ['a leading separator', ',234'],
  ])('rejects %s as malformed grouping', (_label, raw) => {
    expect(parsed(raw)).toEqual({ ok: false, reason: 'unparseable_amount' })
  })

  it('still accepts legal grouping, and no grouping at all', () => {
    expect(parsed('1,234')).toEqual({ ok: true, value: cents(123400) })
    expect(parsed('1,234,567.89')).toEqual({ ok: true, value: cents(123456789) })
    expect(parsed('1234567.89')).toEqual({ ok: true, value: cents(123456789) })
    expect(parsed('123')).toEqual({ ok: true, value: cents(12300) })
  })

  it('never puts the amount into the failure it reports', () => {
    // CONSTRAINTS.md: a rejection reason is a thing that gets logged, and logs
    // carry ids, enum codes and counts only.
    for (const raw of ['12.345', 'twelve dollars', '99999999999999999999.99']) {
      const result = parsed(raw)
      expect(result.ok).toBe(false)
      expect(JSON.stringify(result)).not.toContain(raw)
    }
  })

  it('returns a reason the review queue already knows how to render', () => {
    // These codes are members of RejectionReasonSchema, so a rejected row can
    // be written straight into ingest_candidates.
    const result = parsed('nope')
    expect(result.ok === false && result.reason).toBe('unparseable_amount')
  })
})

describe('applySignConvention', () => {
  it('passes an already-signed column through untouched', () => {
    expect(applySignConvention(cents(-1234), { kind: 'signed' })).toBe(-1234)
    expect(applySignConvention(cents(5000), { kind: 'signed' })).toBe(5000)
  })

  it('flips a statement that writes purchases as positive', () => {
    // Plenty of exports list a purchase as 12.34 and a refund as -12.34. The
    // app stores outflows negative (docs/divergences.md D3), so this inverts.
    expect(applySignConvention(cents(1234), { kind: 'debit_positive' })).toBe(-1234)
    expect(applySignConvention(cents(-1234), { kind: 'debit_positive' })).toBe(1234)
  })

  it('leaves zero as zero under either convention', () => {
    expect(applySignConvention(cents(0), { kind: 'debit_positive' })).toBe(0)
    expect(applySignConvention(cents(0), { kind: 'signed' })).toBe(0)
  })
})

describe('negative zero', () => {
  it('never produces -0 from a negated zero amount', () => {
    // -0 === 0, so no total changes, but Object.is(-0, 0) is false and it
    // compares unequal in a cache key or a test. Zero has no negative.
    for (const raw of ['-0.00', '(0.00)', '-0', '($0.00)']) {
      const result = parseAmountToCents(raw, US_AMOUNT_FORMAT)
      expect(result.ok).toBe(true)
      expect(result.ok === true && Object.is(result.value, 0)).toBe(true)
    }
    expect(Object.is(applySignConvention(cents(0), { kind: 'debit_positive' }), 0)).toBe(true)
  })
})

// What a person types in the app's money fields, and what an AI app sends
// as AmountText: the cents padded, then read as a statement's amount.
describe('parseTypedAmount', () => {
  it.each([
    ['12.5', 1250],
    ['12.50', 1250],
    ['12', 1200],
    ['$1,234.00', 123400],
    ['1234', 123400],
    ['  4.07 ', 407],
    ['0.29', 29],
    ['-5', -500],
    ['0', 0],
  ])('reads %s as %i cents', (text, expected) => {
    expect(parseTypedAmount(text)).toBe(expected)
  })

  it.each(['', '   ', '$', 'abc', '12.345', '1.2.3', '12,5'])('reads %j as no amount', (text) => {
    expect(parseTypedAmount(text)).toBeNull()
  })
})
