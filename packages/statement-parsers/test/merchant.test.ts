import { describe, expect, it } from 'vitest'
import { normalizeMerchant, sameMerchant } from '../src/index.js'

describe('normalizeMerchant strips what cannot change who was paid', () => {
  it.each([
    ['a Square prefix', 'SQ *BLUE BOTTLE COFFEE', 'BLUE BOTTLE COFFEE'],
    ['a Toast prefix', 'TST* THE ITALIAN JOB', 'THE ITALIAN JOB'],
    ['a PayPal prefix', 'PAYPAL *STEAM GAMES', 'STEAM GAMES'],
    ['a bank verb', 'POS PURCHASE SHELL OIL', 'SHELL OIL'],
    ['a store number', 'WALMART #1234', 'WALMART'],
    ['an order number', 'TARGET 00012345', 'TARGET'],
    ['a phone number', 'BLUE BOTTLE 415-555-1234', 'BLUE BOTTLE'],
    ['both a prefix and a number', 'SQ *BLUE BOTTLE COFFEE 4155551234', 'BLUE BOTTLE COFFEE'],
    ['trailing punctuation', 'SHELL OIL -', 'SHELL OIL'],
  ])('removes %s', (_label, raw, expected) => {
    expect(normalizeMerchant(raw)).toBe(expected)
  })

  it('uppercases, so case in a statement is not a second merchant', () => {
    expect(normalizeMerchant('Blue Bottle Coffee')).toBe('BLUE BOTTLE COFFEE')
  })

  it('is idempotent, because the result is stored and normalized again later', () => {
    for (const raw of ['SQ *BLUE BOTTLE 4155551234', 'WALMART #1234', 'SHELL OIL']) {
      const once = normalizeMerchant(raw)
      expect(normalizeMerchant(once)).toBe(once)
    }
  })
})

describe('what it deliberately leaves alone', () => {
  it('keeps a short number, which is usually part of the name', () => {
    // 7-ELEVEN and A&W 76 are businesses, not store numbers.
    expect(normalizeMerchant('7-ELEVEN')).toBe('7-ELEVEN')
    expect(normalizeMerchant('STORE 76')).toBe('STORE 76')
    expect(normalizeMerchant('PHILLIPS 66')).toBe('PHILLIPS 66')
  })

  it('does not treat every asterisk as a processor prefix', () => {
    // A pattern like "anything before an asterisk" eats the merchant here. The
    // prefix list is explicit for exactly this reason.
    expect(normalizeMerchant('A&W *DOWNTOWN')).toBe('A&W *DOWNTOWN')
  })

  it('strips one prefix, never a stack of them', () => {
    // Stripping repeatedly is how a name gets eaten a piece at a time.
    expect(normalizeMerchant('SQ *PP *ODD NAME')).toBe('PP *ODD NAME')
  })

  it('does not strip a number that is the whole name', () => {
    // Emptying a descriptor is the worst outcome: an empty normalized name
    // would match a rule against every other emptied row.
    expect(normalizeMerchant('12345678')).toBe('12345678')
    expect(normalizeMerchant('#4321')).toBe('#4321')
  })

  it('returns empty only for empty input', () => {
    expect(normalizeMerchant('')).toBe('')
    expect(normalizeMerchant('   ')).toBe('')
  })

  it('keeps two different merchants apart', () => {
    // The failure that matters: a rule taught for one auto-approving the other.
    expect(normalizeMerchant('SHELL OIL 1234')).not.toBe(normalizeMerchant('SHELL FISH 1234'))
    expect(normalizeMerchant('WALMART #1')).not.toBe(normalizeMerchant('WALGREENS #1'))
  })
})

describe('sameMerchant', () => {
  it('matches the same business written two ways', () => {
    // The point of normalizing: a processor prefix and a phone number are not
    // a different merchant, so one rule covers both spellings.
    expect(sameMerchant('SQ *BLUE BOTTLE 4155551234', 'Blue Bottle')).toBe(true)
    expect(sameMerchant('SQ *BLUE BOTTLE COFFEE 4155551234', 'blue bottle coffee')).toBe(true)
    expect(sameMerchant('WALMART #1234', 'walmart')).toBe(true)
  })

  it('is equality, never similarity', () => {
    // Auto-approval is the one path that skips human review, so what triggers
    // it must be a lookup rather than a judgment however close the strings are.
    expect(sameMerchant('BLUE BOTTLE COFFEE', 'BLUE BOTTLE COFFE')).toBe(false)
    expect(sameMerchant('BLUE BOTTLE', 'BLUE BOTTLE CO')).toBe(false)
  })
})
