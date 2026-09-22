import { describe, expect, it } from 'vitest'
import { inflateStream, splitObjects } from '../../src/pdf/objects.js'
import { buildPdf, contentFor } from './make-pdf.js'

const decoder = new TextDecoder()

async function firstStream(pdf: Uint8Array): Promise<string> {
  const split = splitObjects(pdf)
  if (!split.ok) throw new Error(split.failure)
  const id = split.objects.contentIds[0]
  const object = id === undefined ? undefined : split.objects.byId.get(id)
  if (object === undefined) throw new Error('no content object')
  const inflated = await inflateStream(object)
  if (!inflated.ok) throw new Error(inflated.failure)
  return decoder.decode(inflated.bytes)
}

describe('finding the objects in a file', () => {
  it('does not truncate an object whose stream bytes spell "endobj"', async () => {
    // Compressed bytes are arbitrary and can spell anything. Splitting objects
    // on `endobj` cuts such an object short and loses the page it described —
    // silently, which is the failure mode worth engineering away.
    const pdf = await buildPdf([contentFor([{ x: 100, y: 700, text: 'AFTER endobj MARKER' }])], {
      uncompressed: true,
    })
    expect(await firstStream(pdf)).toContain('AFTER endobj MARKER')
  })

  it('recovers when /Length overruns the object', async () => {
    // Producers get /Length wrong often enough that every real PDF library
    // carries a recovery path. A length past the end takes the rest of the
    // file with it, so the endstream marker is what decides the extent.
    const pdf = await buildPdf([contentFor([{ x: 100, y: 700, text: 'OVERRUN' }])], {
      lyingLength: true,
    })
    expect(await firstStream(pdf)).toContain('OVERRUN')
  })

  it('reads a stream with no /Filter at all', async () => {
    const pdf = await buildPdf([contentFor([{ x: 100, y: 700, text: 'PLAIN' }])], {
      uncompressed: true,
    })
    expect(await firstStream(pdf)).toContain('PLAIN')
  })

  it('keeps pages in object-number order', async () => {
    const pdf = await buildPdf([
      contentFor([{ x: 1, y: 1, text: 'ONE' }]),
      contentFor([{ x: 1, y: 1, text: 'TWO' }]),
      contentFor([{ x: 1, y: 1, text: 'THREE' }]),
    ])
    const split = splitObjects(pdf)
    expect(split.ok && split.objects.contentIds).toEqual([4, 6, 8])
  })
})

describe('what it refuses, by name', () => {
  it('refuses a file that is not a PDF', () => {
    const csv = new TextEncoder().encode('date,amount\n2026-01-01,1.00\n')
    expect(splitObjects(csv)).toEqual({ ok: false, failure: 'not_a_pdf' })
  })

  it('refuses an encrypted PDF rather than extracting plausible garbage', async () => {
    const pdf = await buildPdf([contentFor([{ x: 1, y: 1, text: 'X' }])], { encrypted: true })
    expect(splitObjects(pdf)).toEqual({ ok: false, failure: 'encrypted' })
  })

  it('refuses a file past the size cap', () => {
    const huge = new Uint8Array(25 * 1024 * 1024)
    huge.set(new TextEncoder().encode('%PDF-1.7\n'), 0)
    expect(splitObjects(huge)).toEqual({ ok: false, failure: 'too_large' })
  })

  it('reports a header with no objects rather than an empty success', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\nnothing here\n%%EOF\n')
    expect(splitObjects(bytes)).toEqual({ ok: false, failure: 'no_objects' })
  })

  it('names an unsupported filter instead of passing the bytes through', async () => {
    // Passing an unknown filter through as plaintext yields runs of binary
    // that look enough like text to be mistaken for an empty page.
    const pdf = await buildPdf([contentFor([{ x: 1, y: 1, text: 'X' }])])
    const split = splitObjects(pdf)
    if (!split.ok) throw new Error(split.failure)
    const id = split.objects.contentIds[0] ?? 0
    const object = split.objects.byId.get(id)
    if (object === undefined) throw new Error('no content object')

    const lxx = { ...object, dict: object.dict.replace('/FlateDecode', '/LZWDecode') }
    expect(await inflateStream(lxx)).toEqual({ ok: false, failure: 'unsupported_filter' })
  })
})
