import { describe, expect, it } from 'vitest'
import { readPdfText } from '../../src/pdf/read.js'
import { groupRows } from '../../src/pdf/layout.js'
import { buildPdf, contentFor, type Cell } from './make-pdf.js'

const COLUMNS = [20, 55, 90, 300]

/**
 * Arial Narrow digits at 9pt advance about this much.
 *
 * Measured off a real statement: `3.34` starts at x=351.12 and `31.45` at
 * x=346.80, one character apart, and all 80 amounts share a right edge near
 * x=368.4. The fixture reproduces that RIGHT alignment because the column
 * boundary depends on it — a fixture with left-aligned amounts would never
 * exercise how close the widest one comes to the edge of its column.
 */
const DIGIT_ADVANCE = 4.32
const AMOUNT_RIGHT_EDGE = 368.4

/**
 * A statement-shaped row, at the x positions a real Rogers statement uses.
 *
 * The positions are real; the merchants and amounts are invented. A card
 * export may not enter this repository (CLAUDE.md), and one would carry a real
 * card number, address and year of spending.
 */
function statementRow(
  y: number,
  trans: readonly string[],
  post: readonly string[],
  desc: readonly string[],
  amount: string,
): Cell[] {
  const cells: Cell[] = [
    { x: 25.68, y, text: trans[0] ?? '' },
    { x: 41.52, y, text: trans[1] ?? '' },
    { x: 59.04, y, text: post[0] ?? '' },
    { x: 74.88, y, text: post[1] ?? '' },
  ]
  let x = 95.04
  for (const word of desc) {
    cells.push({ x, y, text: word })
    x += word.length * 5.6 + 4
  }
  cells.push({ x: AMOUNT_RIGHT_EDGE - amount.length * DIGIT_ADVANCE, y, text: amount })
  return cells
}

const PAGE_ONE: Cell[] = [
  { x: 27.84, y: 400, text: 'Trans' },
  { x: 59.04, y: 400, text: 'Post' },
  { x: 95.04, y: 400, text: 'Description' },
  { x: 340, y: 400, text: 'Amount' },
  ...statementRow(360, ['Aug', '6'], ['Aug', '10'], ['NORTHWIND', 'PRESS', 'VICTORIA', 'BC'], '-12.32'),
  ...statementRow(349, ['Aug', '7'], ['Aug', '10'], ['11111', 'CORNER', 'SHOP', 'ANYTOWN', 'AB'], '3.34'),
  ...statementRow(338, ['Aug', '7'], ['Aug', '10'], ['PAYMENT,', 'THANK', 'YOU'], '-100.00'),
  ...statementRow(327, ['Sep', '1'], ['Sep', '2'], ['CONTOSO', 'DINER', 'ANYTOWN', 'AB'], '-1,000.00'),
]

describe('reading a whole document', () => {
  it('returns one page of runs per page, in order', async () => {
    const pdf = await buildPdf([
      contentFor(PAGE_ONE),
      contentFor([{ x: 100, y: 700, text: 'PAGE TWO' }]),
    ])
    const out = await readPdfText(pdf)

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.document.pages).toHaveLength(2)
    expect(out.document.pages[1]?.map((r) => r.text)).toEqual(['PAGE TWO'])
  })

  it('rebuilds a statement table from positions alone', async () => {
    const pdf = await buildPdf([contentFor(PAGE_ONE)])
    const out = await readPdfText(pdf)
    if (!out.ok) throw new Error(out.failure)

    const rows = groupRows(out.document.pages[0] ?? [], COLUMNS)
    const body = rows.filter((r) => /^(?:Aug|Sep) \d/u.test(r.columns[0] ?? ''))

    expect(body.map((r) => r.columns)).toEqual([
      ['Aug 6', 'Aug 10', 'NORTHWIND PRESS VICTORIA BC', '-12.32'],
      ['Aug 7', 'Aug 10', '11111 CORNER SHOP ANYTOWN AB', '3.34'],
      ['Aug 7', 'Aug 10', 'PAYMENT, THANK YOU', '-100.00'],
      ['Sep 1', 'Sep 2', 'CONTOSO DINER ANYTOWN AB', '-1,000.00'],
    ])
  })
})

describe('telling a scan from an empty statement', () => {
  it('reports no_text_layer when nothing on any page is text', async () => {
    // The two need opposite things from the user: one is "photograph route",
    // the other is "this statement really has no transactions". A reader that
    // returned an empty result for both would send them down the wrong one.
    const pdf = await buildPdf(['', ''], { noTextLayer: true })
    expect(await readPdfText(pdf)).toEqual({ ok: false, failure: 'no_text_layer' })
  })

  it('passes a refusal from the file structure straight through', async () => {
    const pdf = await buildPdf([contentFor([{ x: 1, y: 1, text: 'X' }])], { encrypted: true })
    expect(await readPdfText(pdf)).toEqual({ ok: false, failure: 'encrypted' })
  })
})

describe('one bad page among many', () => {
  it('keeps the pages that did read', async () => {
    // A statement's terms-and-conditions pages are of no interest, and one
    // unreadable page among fourteen should not cost the thirteen that
    // parsed. A page of transactions lost this way is caught downstream,
    // where the statement's own totals will not add up.
    const good = contentFor([{ x: 100, y: 700, text: 'READABLE' }])
    const pdf = await buildPdf([good, good])
    const broken = corruptSecondStream(pdf)

    const out = await readPdfText(broken)
    if (!out.ok) throw new Error(out.failure)
    expect(out.document.pages[0]?.[0]?.text).toBe('READABLE')
    expect(out.document.pages[1]).toEqual([])
  })
})

/**
 * Scribble over the last stream's bytes so inflate fails on that page only.
 *
 * Anchored on `>>\nstream\n` rather than `stream\n`: the latter also matches
 * the tail of every `endstream`, so searching for it lands past the end of the
 * last object and corrupts the trailer instead of any page — leaving both
 * pages readable and the test passing for the wrong reason.
 */
function corruptSecondStream(pdf: Uint8Array): Uint8Array {
  const marker = '>>\nstream\n'
  const text = new TextDecoder('latin1').decode(pdf)
  const at = text.lastIndexOf(marker) + marker.length
  const copy = new Uint8Array(pdf)
  for (let i = at; i < Math.min(at + 16, copy.length); i += 1) copy[i] = 0x7f
  return copy
}
