import { describe, expect, it } from 'vitest'
import { LIBRARY, QUOTE_TAGS } from '../src/index.js'

/**
 * The quotes and tips library's own rules (plan §4, ADR 0005 §8). The words
 * themselves were checked against a source when each entry was committed;
 * these hold every entry to the shape that lets the Coach show it honestly.
 */
describe('the quotes and tips library', () => {
  it('has unique ids of lowercase words and hyphens, with no digit', () => {
    const ids = LIBRARY.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })

  it('gives every quote written or said a title and a year', () => {
    for (const e of LIBRARY.filter((x) => x.attribution !== 'often_attributed')) {
      expect(e.source.title.trim(), e.id).not.toBe('')
      expect(Number.isInteger(e.source.year), e.id).toBe(true)
    }
  })

  it('says how an "often attributed" line is known, every time', () => {
    const often = LIBRARY.filter((e) => e.attribution === 'often_attributed')
    expect(often.length).toBeGreaterThan(0)
    for (const e of often) expect(e.note?.trim() ?? '', e.id).not.toBe('')
  })

  it('names at least one https address for each, where it was checked', () => {
    for (const e of LIBRARY) {
      expect(e.sourceUrls.length, e.id).toBeGreaterThan(0)
      for (const url of e.sourceUrls) expect(new URL(url).protocol, `${e.id} ${url}`).toBe('https:')
    }
  })

  it('keeps each text to 400 characters, and each tag to the closed set', () => {
    for (const e of LIBRARY) {
      expect(e.text.length, e.id).toBeLessThanOrEqual(400)
      expect(e.tags.length, e.id).toBeGreaterThan(0)
      for (const tag of e.tags) expect(QUOTE_TAGS, `${e.id} ${tag}`).toContain(tag)
    }
  })

  it('advises on no product and no investment', () => {
    const products = /(?<!\p{L})(crypto|bitcoin|stocks?|etf|index fund|mutual fund|tfsa|rrsp|gic|invest(ing|ment)?)(?!\p{L})/iu
    for (const e of LIBRARY) expect(`${e.text} ${e.note ?? ''}`, e.id).not.toMatch(products)
  })

  it('leaves out what could not be checked against a source', () => {
    // No evidence Einstein said it (plan §4); the others could not be found in
    // their own words on a primary source when the library was committed.
    const unchecked = [
      /eighth wonder/i,
      /resolve not to be poor/i,
      /spend extravagantly/i,
      /big hat, no cattle/i,
      /spend what is left after saving/i,
    ]
    for (const e of LIBRARY) for (const line of unchecked) expect(e.text, e.id).not.toMatch(line)
  })
})
