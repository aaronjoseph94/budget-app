import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPdfText } from '../../src/pdf/read.js'
import { MAX_DOCUMENT_INFLATED_BYTES, MAX_INFLATED_BYTES } from '../../src/pdf/objects.js'
import { extractRuns } from '../../src/pdf/text.js'
import { buildPdf, contentFor, deflate } from './make-pdf.js'

/**
 * Files made to hurt the reader (security-b-03, security-b-04). The reader
 * runs on the phone's main thread, so a file that inflates without end or
 * makes a pattern backtrack freezes the app. Each must be refused or read
 * in well under vitest's five seconds.
 */

const encoder = new TextEncoder()
const join = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  return out
}

/** `pages` page objects that all name one compressed content stream, object 2. */
async function sharedContentPdf(pages: number, content: string): Promise<Uint8Array> {
  const body = await deflate(encoder.encode(content))
  const head = `%PDF-1.7\n2 0 obj\n<< /Length ${body.byteLength} /Filter /FlateDecode >>\nstream\n`
  const objects = Array.from({ length: pages }, (_, i) => `${10 + i} 0 obj\n<< /Type /Page /Contents 2 0 R >>\nendobj\n`).join('')
  return join([encoder.encode(head), body, encoder.encode(`\nendstream\nendobj\n${objects}%%EOF\n`)])
}

const LINE = contentFor([{ x: 20, y: 700, text: 'A synthetic line' }])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a stream that inflates far past any statement (security-b-03)', () => {
  it('is refused as too large, not buffered whole', async () => {
    const huge = LINE + ' '.repeat(MAX_INFLATED_BYTES + 1)
    expect(await readPdfText(await buildPdf([huge]))).toEqual({ ok: false, failure: 'too_large' })
  })

  it('reads a stream just under the limit', async () => {
    const big = LINE + ' '.repeat(MAX_INFLATED_BYTES - LINE.length)
    const out = await readPdfText(await buildPdf([big]))
    expect(out.ok && out.document.pages[0]?.map((r) => r.text)).toEqual(['A synthetic line'])
  })

  it('inflates a stream that 200 pages name only once, and still gives 200 pages', async () => {
    const file = await sharedContentPdf(200, LINE)
    let made = 0
    const Real = globalThis.DecompressionStream
    vi.stubGlobal(
      'DecompressionStream',
      class extends Real {
        constructor(format: ConstructorParameters<typeof Real>[0]) {
          super(format)
          made += 1
        }
      },
    )
    const out = await readPdfText(file)
    expect(out.ok && out.document.pages.length).toBe(200)
    expect(out.ok && out.document.pages[199]?.map((r) => r.text)).toEqual(['A synthetic line'])
    expect(made).toBe(1)
  })
})

describe('a file whose streams together inflate past the budget (security-b-03)', () => {
  // Each stream is just under its own limit; nine of them together are over
  // the whole file's, and eight are not. About 33 MB is inflated either
  // way, which takes over a second; the wider timeout is for a busy machine.
  const each = MAX_INFLATED_BYTES - 64 * 1024
  const stream = LINE + ' '.repeat(each - LINE.length)

  it('reads eight streams under the budget', async () => {
    expect(8 * each).toBeLessThanOrEqual(MAX_DOCUMENT_INFLATED_BYTES)
    const out = await readPdfText(await buildPdf(Array.from({ length: 8 }, () => stream)))
    expect(out.ok && out.document.pages.length).toBe(8)
  }, 20_000)

  it('refuses nine as too large', async () => {
    expect(9 * each).toBeGreaterThan(MAX_DOCUMENT_INFLATED_BYTES)
    const out = await readPdfText(await buildPdf(Array.from({ length: 9 }, () => stream)))
    expect(out).toEqual({ ok: false, failure: 'too_large' })
  }, 20_000)
})

describe('runs that made the patterns backtrack (security-b-04)', () => {
  const RUN = 200_000

  it('splits a file with a long run of digits outside any object quickly', async () => {
    const plain = await buildPdf([LINE])
    const file = join([plain, encoder.encode(`${'1'.repeat(RUN)}\n`)])
    const started = performance.now()
    const out = await readPdfText(file)
    expect(performance.now() - started).toBeLessThan(2000)
    expect(out.ok).toBe(true)
  })

  it('reads a page holding a long run of digits quickly', () => {
    const started = performance.now()
    const runs = extractRuns(encoder.encode(`${LINE}${'1'.repeat(RUN)}\n${LINE}`))
    expect(performance.now() - started).toBeLessThan(2000)
    expect(runs.map((r) => r.text)).toEqual(['A synthetic line', 'A synthetic line'])
  })

  it('reads a page holding a long run of open brackets quickly', () => {
    const started = performance.now()
    const runs = extractRuns(encoder.encode(`${LINE}${'['.repeat(RUN)}\n${LINE}`))
    expect(performance.now() - started).toBeLessThan(2000)
    expect(runs.map((r) => r.text)).toEqual(['A synthetic line', 'A synthetic line'])
  })

  it('still reads a TJ array whose string holds a bracket', () => {
    const runs = extractRuns(encoder.encode('BT 1 0 0 1 20 700 Tm [(see [note]) -250 (x)] TJ ET'))
    expect(runs.map((r) => r.text)).toEqual(['see [note] x'])
  })
})
