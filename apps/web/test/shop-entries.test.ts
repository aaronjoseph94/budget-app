import { describe, expect, it } from 'vitest'
import { shopEntriesForCore } from '../src/sheet-input.js'

/**
 * Each row's shop and how it came in, as core's detectors read them (F38,
 * F39): a row typed in Add or read from a receipt photo is by hand; a card
 * statement's, whichever file it came from, is not.
 */
const row = (id: string, source: string, merchant: string) => ({ id, posted_on: '2026-09-22', amount_cents: -625, merchant_raw: merchant, category_id: 'dining', source })

describe('shopEntriesForCore', () => {
  it('marks typed and receipt photo rows by hand, and every statement row from a statement', () => {
    const rows = [row('a', 'typed', 'Coffee'), row('b', 'receipt_photo', 'Coffee'), row('c', 'card_csv', 'COFFEE'), row('d', 'card_xlsx', 'COFFEE'), row('e', 'card_pdf', 'COFFEE')]
    expect(shopEntriesForCore(rows).map((e) => [e.id, e.by])).toEqual([
      ['a', 'hand'],
      ['b', 'hand'],
      ['c', 'statement'],
      ['d', 'statement'],
      ['e', 'statement'],
    ])
  })

  it('names the shop as statement-parsers normalises it, and no shop for a blank descriptor', () => {
    const [named, blank] = shopEntriesForCore([row('a', 'card_csv', '  coffee house '), row('b', 'typed', '   ')])
    expect(named).toEqual({ id: 'a', postedOn: '2026-09-22', amountCents: -625, categoryId: 'dining', shop: 'COFFEE HOUSE', by: 'statement' })
    expect(blank!.shop).toBe('')
  })
})
