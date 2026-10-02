import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPdfText } from '../../src/pdf/read.js'
import { buildPdf, contentFor } from './make-pdf.js'

/**
 * A page whose reading throws becomes an empty page, and the others still
 * read (security-b-04). No file the tests know makes the reader throw any
 * more, so the throw is made here without replacing any of the reader:
 * only the middle page holds an octal escape, \101, whose decoding is the
 * one call to String.fromCharCode, and that call fails once as an
 * unforeseen file might make it.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a page whose reading throws', () => {
  it('is an empty page while the pages around it read', async () => {
    const file = await buildPdf([
      contentFor([{ x: 20, y: 700, text: 'first' }]),
      'BT 1 0 0 1 20 700 Tm (\\101 second) Tj ET\n',
      contentFor([{ x: 20, y: 700, text: 'third' }]),
    ])
    const thrown = vi.spyOn(String, 'fromCharCode').mockImplementationOnce(() => {
      throw new RangeError('Maximum call stack size exceeded')
    })
    const out = await readPdfText(file)
    expect(thrown).toHaveBeenCalledTimes(1)
    expect(out.ok && out.document.pages.map((page) => page.map((r) => r.text))).toEqual([['first'], [], ['third']])
  })

  it('reads that middle page when nothing throws', async () => {
    const file = await buildPdf(['BT 1 0 0 1 20 700 Tm (\\101 second) Tj ET\n'])
    const out = await readPdfText(file)
    expect(out.ok && out.document.pages.map((page) => page.map((r) => r.text))).toEqual([['A second']])
  })
})
