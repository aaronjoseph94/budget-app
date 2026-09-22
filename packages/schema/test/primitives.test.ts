import { describe, expect, it } from 'vitest'
import {
  CentsSchema,
  IngestedTextSchema,
  IsoDateSchema,
  TimestampSchema,
  UuidSchema,
} from '../src/index.js'

describe('CentsSchema', () => {
  it('accepts a JSON number and a bigint-as-string identically', () => {
    // PostgREST returns a Postgres bigint either way depending on configuration.
    expect(CentsSchema.parse(2_173_300)).toBe(2173300)
    expect(CentsSchema.parse('2173300')).toBe(2173300)
  })

  it('accepts negatives (outflows) and zero ($0.00 is a real amount)', () => {
    expect(CentsSchema.parse(-8000)).toBe(-8000)
    expect(CentsSchema.parse('-8000')).toBe(-8000)
    expect(CentsSchema.parse(0)).toBe(0)
  })

  it.each([
    ['a float', 1234.56],
    ['a decimal string', '1234.56'],
    ['a non-numeric string', 'twelve dollars'],
    ['an empty string', ''],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['beyond safe integer range', Number.MAX_SAFE_INTEGER + 2],
    ['null', null],
    ['undefined', undefined],
    ['a boolean', true],
  ])('rejects %s', (_label, input) => {
    expect(CentsSchema.safeParse(input).success).toBe(false)
  })

  it('has no default: a missing amount fails rather than becoming zero', () => {
    // CONSTRAINTS.md forbids a silent numeric fallback on a money path. Absent
    // data must reach the review queue, not arrive as a zero nobody chose.
    expect(CentsSchema.safeParse(undefined).success).toBe(false)
    expect(CentsSchema.safeParse(null).success).toBe(false)
  })

  it('never puts the amount into its error message', () => {
    // CONSTRAINTS.md: logs carry ids, enum codes and counts only. A validation
    // error is a thing that gets logged, so this is the rule made executable.
    // `cents()` names the offending number in its RangeError; if that ever
    // escapes CentsSchema instead of being re-messaged, this fails.
    for (const amount of [1234.56, '9876.54', Number.MAX_SAFE_INTEGER + 2, -4321.99]) {
      const result = CentsSchema.safeParse(amount)
      expect(result.success).toBe(false)

      // The rendered number must not appear anywhere in the issue payload.
      const serialised = JSON.stringify(result.error?.issues)
      expect(serialised).not.toContain(String(amount))
      expect(serialised).not.toContain(String(amount).replace('.', ''))
    }
  })
})

describe('IsoDateSchema', () => {
  it('accepts a calendar date', () => {
    expect(IsoDateSchema.parse('2025-03-01')).toBe('2025-03-01')
  })

  it.each([
    ['a day that does not exist', '2025-02-30'],
    ['month zero', '2025-00-10'],
    ['month thirteen', '2025-13-01'],
    ['a US-formatted date', '03/01/2025'],
    ['an instant rather than a date', '2025-03-01T00:00:00Z'],
    ['a loose two-digit month', '2025-3-1'],
    ['empty', ''],
  ])('rejects %s', (_label, input) => {
    expect(IsoDateSchema.safeParse(input).success).toBe(false)
  })

  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(IsoDateSchema.parse('2024-02-29')).toBe('2024-02-29')
    expect(IsoDateSchema.safeParse('2025-02-29').success).toBe(false)
  })
})

describe('IngestedTextSchema', () => {
  it('accepts an ordinary merchant string', () => {
    expect(IngestedTextSchema.parse('SQ *BLUE BOTTLE COFFEE')).toBe('SQ *BLUE BOTTLE COFFEE')
  })

  it.each([
    ['a NUL byte', 'ACME\u0000CORP'],
    ['an escape character', 'ACME\u001bCORP'],
    ['a newline', 'ACME\nCORP'],
    ['a DEL byte', 'ACME\u007fCORP'],
    ['a C1 control', 'ACME\u0085CORP'],
    ['a line separator', 'ACME\u2028CORP'],
    ['a paragraph separator', 'ACME\u2029CORP'],
    ['a right-to-left override', 'ACME\u202eCORP'],
    ['a bidi isolate', 'ACME\u2066CORP'],
    ['empty', ''],
  ])('rejects %s', (_label, input) => {
    expect(IngestedTextSchema.safeParse(input).success).toBe(false)
  })

  it('rejects text beyond 512 characters', () => {
    expect(IngestedTextSchema.safeParse('A'.repeat(512)).success).toBe(true)
    expect(IngestedTextSchema.safeParse('A'.repeat(513)).success).toBe(false)
  })

  it('rejects a descriptor that would display differently than it is stored', () => {
    // A right-to-left override reverses how the rest of the string renders
    // while leaving the stored bytes alone, so the reviewer reads one thing
    // and approves another. It is not markup, so the render-time rule against
    // markup never sees it, and the human is the only gate (CLAUDE.md #3).
    expect(IngestedTextSchema.safeParse('SAFE STORE \u202e DEGGALF').success).toBe(false)
  })

  it('still accepts ordinary non-ASCII merchant names', () => {
    // The rule targets display-control characters, not accented or non-Latin
    // text, which is ordinary in a merchant descriptor.
    expect(IngestedTextSchema.parse('CAFÉ MÜNCHEN')).toBe('CAFÉ MÜNCHEN')
    expect(IngestedTextSchema.parse('セブンイレブン')).toBe('セブンイレブン')
    expect(IngestedTextSchema.parse('Ω PHARMACY')).toBe('Ω PHARMACY')
  })

  it('never puts the merchant string into its error message', () => {
    // CONSTRAINTS.md forbids logging a merchant, by the same reasoning as amounts.
    const result = IngestedTextSchema.safeParse('SECRET MERCHANT\u0000NAME')
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).not.toContain('SECRET MERCHANT')
  })

  it('does not trim, because normalization is statement-parsers’ job', () => {
    // Trimming here would silently disagree with the merchant string the dedupe
    // hash is computed over. One module owns normalization; this is not it.
    expect(IngestedTextSchema.parse('  ACME  ')).toBe('  ACME  ')
  })
})

describe('UuidSchema and TimestampSchema', () => {
  it('accepts well-formed values', () => {
    expect(UuidSchema.parse('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    )
    expect(TimestampSchema.parse('2025-03-01T12:30:00Z')).toBe('2025-03-01T12:30:00Z')
  })

  it('UuidSchema rejects a bare integer id', () => {
    expect(UuidSchema.safeParse('12345').success).toBe(false)
  })

  it('TimestampSchema rejects an instant with no offset', () => {
    // A timestamptz without a zone is ambiguous, and an ambiguous instant on a
    // ledger row is a wrong date waiting to happen.
    expect(TimestampSchema.safeParse('2025-03-01T12:30:00').success).toBe(false)
  })
})
