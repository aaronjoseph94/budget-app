import { describe, expect, it } from 'vitest'
import {
  US_AMOUNT_FORMAT,
  readStatement,
  tokenizeCsv,
  type ColumnMapping,
  type ReadOptions,
} from '../src/index.js'

const MAPPING: ColumnMapping = {
  dateIndex: 0,
  merchantIndex: 1,
  amountIndex: 2,
  sign: { kind: 'signed' },
}

const read = (text: string, over: Partial<ReadOptions> = {}) => {
  const out = tokenizeCsv(text, { delimiter: ',' })
  if (!out.ok) throw new Error(`tokenize failed: ${out.failure.kind}`)
  return readStatement(out.rows, {
    mapping: MAPPING,
    amountFormat: US_AMOUNT_FORMAT,
    dateFormat: 'MM/DD/YYYY',
    hasHeader: true,
    ...over,
  })
}

const HEADER = 'Date,Description,Amount'

describe('readStatement', () => {
  it('reads a clean statement', () => {
    const r = read(`${HEADER}\n03/04/2025,COFFEE,-4.50\n03/05/2025,GAS,-40.00`)
    expect(r.accepted).toHaveLength(2)
    expect(r.rejected).toHaveLength(0)
    expect(r.accepted[0]).toMatchObject({
      line: 2,
      postedOn: '2025-03-04',
      amountCents: -450,
      merchantRaw: 'COFFEE',
    })
  })

  it('reads the quoted amount that a naive reader turns into $1.00', () => {
    // The worst case in the format, end to end: tokenizer keeps the inner
    // comma, the grouping check accepts it, and the ledger gets $1,234.56.
    const r = read(`${HEADER}\n03/04/2025,GROCERY OUTLET,"-1,234.56"`)
    expect(r.accepted[0]?.amountCents).toBe(-123456)
  })
})

describe('the counts balance', () => {
  it('accounts for every non-blank data row', () => {
    const r = read(
      [
        HEADER,
        '03/04/2025,COFFEE,-4.50',
        'not-a-date,GAS,-40.00',
        '03/06/2025,RENT,not-money',
        '03/07/2025,,-9.00',
        '03/08/2025,SHOP,-1.00',
      ].join('\n'),
    )
    expect(r.parsed).toBe(5)
    expect(r.accepted.length + r.rejected.length).toBe(r.parsed)
    expect(r.accepted).toHaveLength(2)
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'unparseable_date',
      'unparseable_amount',
      'missing_merchant',
    ])
  })

  it('counts blank lines separately, rather than as transactions or as losses', () => {
    // Dropping them silently would make parsed disagree with the file; counting
    // them as parsed would claim a blank line was a transaction.
    const r = read(`${HEADER}\n03/04/2025,COFFEE,-4.50\n\n,,\n03/05/2025,GAS,-40.00`)
    expect(r.parsed).toBe(2)
    expect(r.blankSkipped).toBe(2)
    expect(r.accepted).toHaveLength(2)
  })

  it('names the line of every rejection, so the queue row is actionable', () => {
    const r = read(`${HEADER}\n03/04/2025,COFFEE,-4.50\nnope,GAS,-40.00`)
    expect(r.rejected[0]?.line).toBe(3)
  })

  it('never puts a field value into a rejection', () => {
    // A rejection is a thing that gets logged, and logs carry ids, enum codes
    // and counts only.
    const r = read(`${HEADER}\n03/04/2025,SECRET MERCHANT,9,999.99x`)
    expect(r.rejected).toHaveLength(1)
    expect(JSON.stringify(r.rejected)).not.toContain('SECRET')
    expect(JSON.stringify(r.rejected)).not.toContain('999')
  })
})

describe('a file that opens with a blank line', () => {
  it('still finds the real header, agreeing with detectHeaderRow', () => {
    // readStatement used to slice rows[0] while detectHeaderRow and
    // profileColumns filtered blanks first, so the three disagreed about which
    // record was the header. Every transaction was rejected as ragged, none
    // accepted, and the count check still passed.
    const r = read(`\n${HEADER}\n03/04/2025,COFFEE,-4.50\n03/05/2025,GAS,-40.00`)
    expect(r.accepted).toHaveLength(2)
    expect(r.rejected).toHaveLength(0)
    expect(r.blankSkipped).toBe(1)
    expect(r.parsed).toBe(2)
  })

  it('counts a blank line wherever it sits', () => {
    const r = read(`\n\n${HEADER}\n03/04/2025,COFFEE,-4.50\n\n03/05/2025,GAS,-40.00`)
    expect(r.accepted).toHaveLength(2)
    expect(r.blankSkipped).toBe(3)
    expect(r.parsed).toBe(r.accepted.length + r.rejected.length)
  })
})

describe('a ragged row is a shape failure, decided before any field is read', () => {
  it('rejects an extra field rather than realigning it', () => {
    // An unquoted comma in `SMITH, JOHN LANDSCAPING`. Taking the last field as
    // the amount gives the RIGHT amount and a merchant truncated to `SMITH` —
    // and merchant_raw is what the dedupe hash is built from.
    const r = read(`${HEADER}\n03/04/2025,SMITH, JOHN LANDSCAPING,-45.00`)
    expect(r.rejected).toEqual([{ line: 2, reason: 'row_shape_mismatch' }])
  })

  it('rejects a short footer total row', () => {
    const r = read(`${HEADER},Balance,Reference\nTotals,,-1234.56`)
    expect(r.rejected[0]?.reason).toBe('row_shape_mismatch')
  })

  it('reports shape even when every mapped field would have parsed', () => {
    // The mapped indexes are pointing at whichever columns happen to sit
    // there. A field-level reason would name a symptom and hide the cause.
    const r = read(`${HEADER}\n03/04/2025,COFFEE,-4.50,EXTRA`)
    expect(r.rejected[0]?.reason).toBe('row_shape_mismatch')
  })
})

describe('one reason per row, in a fixed order', () => {
  it('reports the date when both the date and the amount are bad', () => {
    // A row can fail several ways at once and the column holds one value. The
    // order is fixed so the same bad row always reports the same reason.
    const r = read(`${HEADER}\nnope,COFFEE,not-money`)
    expect(r.rejected[0]?.reason).toBe('unparseable_date')
  })

  it.each([
    ['an empty date', '${H}\n,COFFEE,-4.50', 'missing_date'],
    ['an empty amount', '${H}\n03/04/2025,COFFEE,', 'missing_amount'],
    ['an empty merchant', '${H}\n03/04/2025,,-4.50', 'missing_merchant'],
  ])('reports %s distinctly from an unreadable one', (_label, template, reason) => {
    const r = read(template.replace('${H}', HEADER))
    expect(r.rejected[0]?.reason).toBe(reason)
  })

  it('rejects a merchant the text rules refuse, distinctly from a missing one', () => {
    // A descriptor carrying a text-direction override displays differently
    // than it is stored, and the reviewer is the only gate.
    const r = read(`${HEADER}\n03/04/2025,"SAFE ‮ EROTS",-4.50`)
    expect(r.rejected[0]?.reason).toBe('invalid_merchant')
  })
})

describe('sign, issuer id and headerless files', () => {
  it('flips a statement that writes purchases as positive', () => {
    const r = read(`${HEADER}\n03/04/2025,COFFEE,4.50`, {
      mapping: { ...MAPPING, sign: { kind: 'debit_positive' } },
    })
    expect(r.accepted[0]?.amountCents).toBe(-450)
  })

  it('carries an issuer transaction id when the export has one', () => {
    const r = read(`${HEADER},Ref\n03/04/2025,COFFEE,-4.50,TXN-1`, {
      mapping: { ...MAPPING, issuerIdIndex: 3 },
    })
    expect(r.accepted[0]?.issuerTransactionId).toBe('TXN-1')
  })

  it('treats an id the export left blank as absent, not as an identity', () => {
    // Otherwise every such row shares one dedupe key and all but the first
    // silently vanish from the ledger.
    const r = read(`${HEADER},Ref\n03/04/2025,COFFEE,-4.50,`, {
      mapping: { ...MAPPING, issuerIdIndex: 3 },
    })
    expect(r.accepted[0]?.issuerTransactionId).toBeUndefined()
  })

  it('reads a headerless export without discarding its first charge', () => {
    const r = read('03/04/2025,COFFEE,-4.50\n03/05/2025,GAS,-40.00', { hasHeader: false })
    expect(r.accepted).toHaveLength(2)
    expect(r.accepted[0]?.line).toBe(1)
  })
})
