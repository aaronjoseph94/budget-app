import { describe, expect, it } from 'vitest'
import { decodeLiteral, extractRuns } from '../../src/pdf/text.js'

const content = (source: string): Uint8Array => new TextEncoder().encode(source)

describe('decoding the strings a descriptor arrives in', () => {
  it('resolves the escapes a merchant name can contain', () => {
    // Real descriptors carry these: `SKIP* SKIPPLUSXCIBC WINNIPEG (BROMB` is
    // truncated by the bank mid-word, leaving an unbalanced parenthesis that
    // the producer must escape.
    expect(decodeLiteral(String.raw`A\(B\)C`)).toBe('A(B)C')
    expect(decodeLiteral(String.raw`SHELL\\OIL`)).toBe('SHELL\\OIL')
    expect(decodeLiteral(String.raw`TAB\tSEP`)).toBe('TAB\tSEP')
  })

  it('reads octal escapes, which is how a non-ASCII character arrives', () => {
    expect(decodeLiteral(String.raw`\101\102`)).toBe('AB')
    expect(decodeLiteral(String.raw`CAF\311`)).toBe('CAFÉ')
  })

  it('drops a backslash-newline continuation entirely', () => {
    expect(decodeLiteral('LINE\\\nCONTINUED')).toBe('LINECONTINUED')
    expect(decodeLiteral('LINE\\\r\nCONTINUED')).toBe('LINECONTINUED')
  })

  it('reads a hex string, padding an odd final digit as the spec requires', () => {
    expect(extractRuns(content('BT <414243> Tj ET'))[0]?.text).toBe('ABC')
    expect(extractRuns(content('BT <4142 4> Tj ET'))[0]?.text).toBe('AB@')
  })
})

describe('positions', () => {
  it('takes x and y from the text matrix', () => {
    const runs = extractRuns(content('BT 1 0 0 1 95.04 360.95 Tm (LEANPUB) Tj ET'))
    expect(runs).toEqual([{ x: 95.04, y: 360.95, text: 'LEANPUB' }])
  })

  it('accumulates Td offsets within one text object', () => {
    const runs = extractRuns(content('BT 10 700 Td (A) Tj 20 0 Td (B) Tj ET'))
    expect(runs.map((r) => [r.x, r.y])).toEqual([
      [10, 700],
      [30, 700],
    ])
  })

  it('moves down a line for T* and for the quote operators', () => {
    const runs = extractRuns(content("BT 14 TL 0 700 Td (A) Tj T* (B) Tj (C) ' ET"))
    expect(runs.map((r) => r.y)).toEqual([700, 686, 672])
  })

  it('resets position at each BT, so one page does not drift into the next', () => {
    const runs = extractRuns(content('BT 10 700 Td (A) Tj ET BT (B) Tj ET'))
    expect(runs.map((r) => [r.x, r.y])).toEqual([
      [10, 700],
      [0, 0],
    ])
  })
})

describe('spacing inside a TJ array', () => {
  it('treats a wide negative advance as a space', () => {
    expect(extractRuns(content('BT [(LAVA) -250 (GRILL)] TJ ET'))[0]?.text).toBe('LAVA GRILL')
  })

  it('does not turn kerning into a space', () => {
    // A threshold set too low gives every merchant name spurious gaps, and
    // `WALMART` becomes `WAL MART` — a different merchant for rule matching.
    expect(extractRuns(content('BT [(WAL) -20 (MART)] TJ ET'))[0]?.text).toBe('WALMART')
  })

  it('ignores a positive advance, which tightens rather than separates', () => {
    expect(extractRuns(content('BT [(A) 120 (B)] TJ ET'))[0]?.text).toBe('AB')
  })
})

describe('what it declines to emit', () => {
  it('emits no run for whitespace alone', () => {
    expect(extractRuns(content('BT (   ) Tj ET'))).toEqual([])
  })

  it('emits no run when a position is not a finite number', () => {
    // A lone `-` satisfies the matrix pattern and then parses to NaN. Placed,
    // such a run sorts unpredictably against every other and lands in an
    // arbitrary column — a transaction's amount in its description, say.
    expect(extractRuns(content('BT 1 0 0 1 - 700 Tm (X) Tj ET'))).toEqual([])
  })

  it('leaves the position alone when a matrix does not parse at all', () => {
    // `abc` does not match the operand pattern, so the Tm is not recognised
    // and the run keeps the position it already had. At the origin it falls
    // left of every column boundary and the layout pass drops it, which is
    // the right outcome for text this reader could not place.
    expect(extractRuns(content('BT 1 0 0 1 abc 700 Tm (X) Tj ET'))).toEqual([
      { x: 0, y: 0, text: 'X' },
    ])
  })
})
