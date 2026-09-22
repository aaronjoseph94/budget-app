import { describe, expect, it } from 'vitest'
import { isBlankRow, tokenizeCsv, type CsvRow } from '../src/index.js'

/**
 * Cases enumerated before this tokenizer was written, by six independent
 * reviewers sweeping RFC 4180, real bank exports, encodings, hostile input,
 * column detection and failure counting. Each name below is one of those cases.
 */
const COMMA = { delimiter: ',' }

const fieldsOf = (text: string, delimiter = ','): readonly (readonly string[])[] => {
  const out = tokenizeCsv(text, { delimiter })
  if (!out.ok) throw new Error(`expected success, got ${out.failure.kind}`)
  return out.rows.map((r: CsvRow) => r.fields)
}

describe('the field that makes every other guard work', () => {
  it('keeps the inner separator of a quoted amount', () => {
    // Called the single worst case in the format: split naively, "-1,234.56"
    // becomes "-1", which is a legal amount of minus one dollar. A $1,234.56
    // charge silently becomes $1.00, parses ok, and looks plausible in review.
    expect(fieldsOf('03/04/2025,GROCERY OUTLET,"-1,234.56"')).toEqual([
      ['03/04/2025', 'GROCERY OUTLET', '-1,234.56'],
    ])
  })

  it('keeps a delimiter inside a quoted merchant without shifting later columns', () => {
    expect(fieldsOf('03/04/2025,"WALMART #1234, LUBBOCK TX",-45.00,1203.55')).toEqual([
      ['03/04/2025', 'WALMART #1234, LUBBOCK TX', '-45.00', '1203.55'],
    ])
  })
})

describe('records and terminators', () => {
  it('flushes a final record that ends at EOF with no newline', () => {
    // A state machine that only emits on a newline loses the last transaction,
    // and the counts still balance because it was never parsed at all.
    expect(fieldsOf('D,M,A\n03/04/2025,COFFEE,-4.50\n03/05/2025,GAS,-40.00')).toHaveLength(3)
  })

  it('does not invent a phantom record for a trailing newline', () => {
    expect(fieldsOf('a,b\nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it.each([
    ['LF', 'a,b\nc,d'],
    ['CRLF', 'a,b\r\nc,d'],
    ['lone CR (Excel for Macintosh)', 'a,b\rc,d'],
  ])('splits records on %s', (_label, text) => {
    // A lone CR handled as an ordinary character collapses the whole file into
    // one record; CRLF split on \n alone leaves a stray \r on the last field.
    expect(fieldsOf(text)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('handles mixed line endings within one file', () => {
    expect(fieldsOf('a,b\r\nc,d\ne,f\rg,h')).toHaveLength(4)
  })

  it('treats a record separator inside quotes as data, not a separator', () => {
    // Amex extended details and several UK exports put multi-line memos in a
    // quoted column. Splitting on lines first fabricates a second transaction.
    // One record is the structural claim; the break is then normalized to a
    // space so a real charge is not rejected over its formatting (D4).
    const rows = fieldsOf('03/04/2025,"AMAZON MKTPLACE\r\nORDER 112-3456",-45.00')
    expect(rows).toHaveLength(1)
    expect(rows).toEqual([['03/04/2025', 'AMAZON MKTPLACE ORDER 112-3456', '-45.00']])
  })

  it('collapses internal whitespace runs, so one memo hashes one way', () => {
    // The same descriptor arrives CRLF-separated in one download and
    // LF-separated in the next; unnormalized they are two different charges.
    expect(fieldsOf('a,"X\r\nY",b')[0]?.[1]).toBe('X Y')
    expect(fieldsOf('a,"X\nY",b')[0]?.[1]).toBe('X Y')
    expect(fieldsOf('a,"X   Y",b')[0]?.[1]).toBe('X Y')
  })

  it('still refuses a descriptor that displays differently than it is stored', () => {
    // A bidi override is not whitespace, so normalization does not launder it
    // and the schema's guard still sees it.
    expect(fieldsOf('a,"SAFE \u202e EROTS",b')[0]?.[1]).toContain('\u202e')
  })

  it('counts a multi-line quoted field as one line break, not two', () => {
    const out = tokenizeCsv('a,"x\r\ny"\nb,c', COMMA)
    expect(out.ok && out.rows.map((r) => r.line)).toEqual([1, 3])
  })
})

describe('quoting', () => {
  it.each([
    ['a doubled quote is one literal quote', '03/04,"JOE""S CRAB",-45', 'JOE"S CRAB'],
    ['a doubled quote before the terminator', '03/04,"ACME ""FRESH""",-45', 'ACME "FRESH"'],
    ['a quoted empty field is the empty string', '03/04,"",-45', ''],
  ])('%s', (_label, text, expected) => {
    expect(fieldsOf(text)[0]?.[1]).toBe(expected)
  })

  it('treats a bare quote inside an unquoted field as a literal', () => {
    // Quoting is decided by the first character of the field. An inch mark in
    // `15" PIZZA CO` is content, and entering quoted mode here would swallow
    // the rest of the file.
    expect(fieldsOf('03/04/2025,15" PIZZA CO,-45.00')).toEqual([
      ['03/04/2025', '15" PIZZA CO', '-45.00'],
    ])
  })

  it('accepts the padding Excel writes between a delimiter and an opening quote', () => {
    expect(fieldsOf('a, "b, c" ,d')).toEqual([['a', 'b, c', 'd']])
  })

  it('preserves a NUL inside a field rather than dropping it', () => {
    // The schema rejects it downstream with a readable reason. Dropping it here
    // would let a forged dedupe separator through looking clean.
    expect(fieldsOf('a,"X\u0000Y",b')[0]?.[1]).toBe('X\u0000Y')
  })
})

describe('whitespace, which is a dedupe-hash input', () => {
  it('trims every field, quoted or not', () => {
    // docs/divergences.md D4. Exports pad inconsistently between downloads, and
    // untrimmed padding re-hashes the same charge into a second ledger row.
    expect(fieldsOf('03/04/2025,COFFEE HOUSE   ,  -4.50')).toEqual([
      ['03/04/2025', 'COFFEE HOUSE', '-4.50'],
    ])
    expect(fieldsOf('a,"  PADDED  ",b')[0]?.[1]).toBe('PADDED')
  })

  it('reduces a whitespace-only field to empty, so it fails as missing', () => {
    expect(fieldsOf('03/04/2025,   ,-4.50')[0]?.[1]).toBe('')
  })

  it('distinguishes an empty field from an absent one', () => {
    // Three fields with a hole is a missing merchant; two fields is a
    // structurally ragged row. Different failures, different reasons.
    expect(fieldsOf('03/04/2025,,-4.50')[0]).toHaveLength(3)
    expect(fieldsOf('03/04/2025,-4.50')[0]).toHaveLength(2)
  })
})

describe('what it refuses to rescue', () => {
  it('reports a ragged row exactly as it found it', () => {
    // Four fields against a three-column header. Realigning, truncating, or
    // taking the last field as the amount all import a row whose merchant is
    // silently wrong — and merchant_raw is what the dedupe hash is built on.
    expect(fieldsOf('03/04/2025,SMITH, JOHN LANDSCAPING,-45.00')[0]).toHaveLength(4)
  })

  it('reports a short footer row exactly as it found it', () => {
    expect(fieldsOf('Totals,,-1234.56')[0]).toHaveLength(3)
  })

  it('emits a blank line as a row, rather than dropping it', () => {
    // Dropping it would make the row count disagree with the file, and the
    // count invariant is checked against what the file actually held.
    const rows = fieldsOf('a,b\n\nc,d')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toEqual([''])
  })

  it('identifies blank and delimiter-only rows without discarding them', () => {
    const out = tokenizeCsv('a,b\n\n,,\nc,d', COMMA)
    expect(out.ok && out.rows.map(isBlankRow)).toEqual([false, true, true, false])
  })
})

describe('file-level failures', () => {
  it('refuses a file whose quote is never closed', () => {
    // Auto-closing at EOF turns 200 remaining charges into one rejected row,
    // and the counts balance while describing a file that does not exist.
    const out = tokenizeCsv('03/04,"COFFEE,-4.50\n03/05,GAS,-40.00\n03/06,RENT,-1800', COMMA)
    expect(out.ok).toBe(false)
    expect(!out.ok && out.failure.kind).toBe('unterminated_quote')
  })

  it('refuses text after a closing quote rather than truncating the field', () => {
    const out = tokenizeCsv('a,"b"junk,c', COMMA)
    expect(!out.ok && out.failure.kind).toBe('text_after_closing_quote')
  })

  it.each([
    ['an empty delimiter', ''],
    ['a multi-character delimiter', '::'],
    ['the quote character', '"'],
    ['a newline', '\n'],
  ])('refuses %s', (_label, delimiter) => {
    const out = tokenizeCsv('a,b', { delimiter })
    expect(!out.ok && out.failure.kind).toBe('invalid_delimiter')
  })

  it('names a line but never any content in a failure', () => {
    // A failure is a thing that gets logged, and logs carry ids and counts only.
    const out = tokenizeCsv('a,b\nc,"SECRET MERCHANT,9999.99', COMMA)
    expect(out.ok).toBe(false)
    expect(JSON.stringify(out)).not.toContain('SECRET')
    expect(JSON.stringify(out)).not.toContain('9999')
  })
})

describe('encoding and delimiters', () => {
  it('strips a UTF-8 BOM so it does not ride on the first header name', () => {
    const rows = fieldsOf('﻿Date,Description,Amount\n03/04,COFFEE,-4.50')
    expect(rows[0]?.[0]).toBe('Date')
  })

  it.each([
    ['semicolon, as European exports use', ';', 'a;b;c'],
    ['tab', '\t', 'a\tb\tc'],
    ['pipe', '|', 'a|b|c'],
  ])('tokenizes with %s', (_label, delimiter, text) => {
    expect(fieldsOf(text, delimiter)).toEqual([['a', 'b', 'c']])
  })

  it('leaves a comma alone when the delimiter is a semicolon', () => {
    // The reason a European file is semicolon-delimited is that its decimal
    // separator is the comma. Reading it with the wrong delimiter changes
    // every amount, not merely the column boundaries.
    expect(fieldsOf('03/04/2025;GROCERY;-1.234,56', ';')).toEqual([
      ['03/04/2025', 'GROCERY', '-1.234,56'],
    ])
  })

  it('reports the line each record started on', () => {
    const out = tokenizeCsv('h1,h2\na,b\nc,d', COMMA)
    expect(out.ok && out.rows.map((r) => r.line)).toEqual([1, 2, 3])
  })
})
