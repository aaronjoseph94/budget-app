/**
 * The parts of a PDF file needed to reach the text on a page.
 *
 * Written rather than taken from a library, deliberately. The alternative is
 * pdf.js, which is an excellent renderer and about 1MB of JavaScript to send to
 * a phone so that a statement table can be read. This reads statements: it
 * needs objects, Flate streams and text-showing operators, and nothing else.
 *
 * The safety argument for a hand-written reader is not "it handles everything".
 * It plainly does not — see the refusals below, each of which is a case this
 * declines rather than guesses at. The argument is that a misread cannot pass
 * silently: a statement carries its own totals, and the import is rejected
 * unless the rows add up to them (packages/core statement-reconciliation).
 * A reader that can only fail loudly is safer than one that fails subtly.
 *
 * Nothing here computes money, or anything else. It moves bytes.
 */

/** Refusals. Each names a thing this reader cannot do, so the app can say so. */
export type PdfFailure =
  | 'not_a_pdf'
  | 'encrypted'
  | 'no_objects'
  | 'no_pages'
  | 'too_large'
  | 'unsupported_filter'
  | 'stream_undecodable'

/**
 * 24MB. A text-layer statement is a few hundred KB; the sample this was built
 * against is 5MB because banks embed fonts and a logo. Well above anything
 * real, well below what would exhaust a phone.
 */
export const MAX_PDF_BYTES = 24 * 1024 * 1024
/** A statement with more pages than this is not a statement. */
export const MAX_PDF_PAGES = 200

export interface PdfObject {
  readonly id: number
  /** The dictionary text, decoded as Latin-1. Binary stream data is excluded. */
  readonly dict: string
  /** The stream body, still encoded. Null when the object has no stream. */
  readonly raw: Uint8Array | null
}

export interface PdfObjects {
  readonly byId: ReadonlyMap<number, PdfObject>
  /** Content-stream object ids, in page order. */
  readonly contentIds: readonly number[]
}

export type ObjectsOutcome =
  | { readonly ok: true; readonly objects: PdfObjects }
  | { readonly ok: false; readonly failure: PdfFailure }

/**
 * Latin-1, not UTF-8.
 *
 * PDF dictionaries are byte-oriented and a stream's binary body is arbitrary.
 * Decoding as UTF-8 would replace invalid sequences with U+FFFD and corrupt the
 * byte offsets this relies on. The label `latin1` resolves to windows-1252,
 * which is also what a simple font's WinAnsiEncoding means, so text extracted
 * later decodes correctly by the same route.
 */
const latin1 = new TextDecoder('latin1')

const OBJECT_HEADER = /(\d+)\s+(\d+)\s+obj\b/g

/**
 * Split the file into numbered objects.
 *
 * Objects are delimited by the NEXT object header rather than by `endobj`.
 * A stream's body is arbitrary bytes and can contain the letters `endobj`;
 * scanning for that marker truncates such an object and silently loses the
 * page it described. An object header is a far less likely byte sequence, and
 * the stream extent is taken from `/Length` where the file gives one directly.
 */
export function splitObjects(bytes: Uint8Array): ObjectsOutcome {
  if (bytes.byteLength > MAX_PDF_BYTES) return { ok: false, failure: 'too_large' }

  const head = latin1.decode(bytes.subarray(0, 1024))
  if (!head.includes('%PDF-')) return { ok: false, failure: 'not_a_pdf' }

  const text = latin1.decode(bytes)

  // Refused rather than attempted. An encrypted PDF needs the password
  // algorithms from the spec, and a partial attempt would yield plausible
  // garbage — the one failure mode this design exists to rule out.
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(text)) return { ok: false, failure: 'encrypted' }

  const starts: Array<{ id: number; headerAt: number; bodyAt: number }> = []
  OBJECT_HEADER.lastIndex = 0
  for (let m = OBJECT_HEADER.exec(text); m !== null; m = OBJECT_HEADER.exec(text)) {
    const id = Number(m[1])
    if (Number.isSafeInteger(id)) {
      starts.push({ id, headerAt: m.index, bodyAt: m.index + m[0].length })
    }
  }
  if (starts.length === 0) return { ok: false, failure: 'no_objects' }

  const byId = new Map<number, PdfObject>()
  for (let i = 0; i < starts.length; i += 1) {
    const here = starts[i]
    if (here === undefined) continue
    const next = starts[i + 1]
    const end = next === undefined ? text.length : next.headerAt
    byId.set(here.id, readObject(here.id, text.slice(here.bodyAt, end), bytes, here.bodyAt))
  }

  return { ok: true, objects: { byId, contentIds: pageContentIds(byId) } }
}

function readObject(
  id: number,
  body: string,
  bytes: Uint8Array,
  bodyAt: number,
): PdfObject {
  const streamAt = body.indexOf('stream')
  if (streamAt < 0) return { id, dict: body, raw: null }

  const dict = body.slice(0, streamAt)
  // `stream` is followed by CRLF or LF, and by nothing else per the spec.
  let from = streamAt + 'stream'.length
  if (body[from] === '\r') from += 1
  if (body[from] === '\n') from += 1

  // Two ways to find the end of the stream, each wrong in a different case.
  //
  // `/Length` is authoritative per the spec, but producers get it wrong often
  // enough that every real PDF library carries a recovery path for it, and a
  // length that overruns takes the rest of the file with it.
  //
  // `endstream` cannot overrun, and its failure mode — those nine bytes
  // occurring inside compressed data — needs a specific 9-byte sequence to
  // appear by chance, which is vanishingly less likely than a producer bug.
  //
  // So the marker wins where it exists, and `/Length` is the fallback. The
  // EOL the spec requires before `endstream` is not part of the data.
  const declared = /\/Length\s+(\d+)\b/.exec(dict)
  const declaredLength =
    declared !== null && Number.isSafeInteger(Number(declared[1])) ? Number(declared[1]) : null
  const endAt = body.indexOf('endstream', from)
  const available = Math.max(0, body.length - from)
  let length: number
  if (endAt >= 0) {
    let stop = endAt
    if (body[stop - 1] === '\n') stop -= 1
    if (body[stop - 1] === '\r') stop -= 1
    length = stop - from
  } else {
    length = declaredLength !== null ? Math.min(declaredLength, available) : available
  }

  const start = bodyAt + from
  return { id, dict, raw: bytes.subarray(start, start + Math.max(0, length)) }
}

/** Content-stream object ids for every page, in the order the pages appear. */
function pageContentIds(byId: ReadonlyMap<number, PdfObject>): readonly number[] {
  const ids: Array<{ page: number; content: number }> = []
  for (const [id, object] of byId) {
    if (!/\/Type\s*\/Page(?![a-zA-Z])/.test(object.dict)) continue
    const single = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(object.dict)
    if (single !== null) {
      ids.push({ page: id, content: Number(single[1]) })
      continue
    }
    const array = /\/Contents\s*\[([^\]]*)\]/.exec(object.dict)
    if (array === null) continue
    for (const ref of array[1]?.matchAll(/(\d+)\s+\d+\s+R/g) ?? []) {
      ids.push({ page: id, content: Number(ref[1]) })
    }
  }
  // Object number order is the page order for every linearised producer seen.
  // It is not guaranteed by the spec; a statement whose pages come out shuffled
  // still reconciles, because the totals do not depend on row order.
  ids.sort((a, b) => a.page - b.page)
  return ids.slice(0, MAX_PDF_PAGES).map((p) => p.content)
}

/**
 * Decode one stream body.
 *
 * Only FlateDecode, which is what every statement producer uses for content.
 * An unfamiliar filter is refused by name rather than passed through as
 * plaintext, because passing it through yields runs of binary that look enough
 * like text to be mistaken for an empty page.
 */
export async function inflateStream(
  object: PdfObject,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; failure: PdfFailure }> {
  if (object.raw === null) return { ok: false, failure: 'stream_undecodable' }

  const filter = /\/Filter\s*\/(\w+)/.exec(object.dict)?.[1]
  if (filter === undefined) return { ok: true, bytes: object.raw }
  if (filter !== 'FlateDecode') return { ok: false, failure: 'unsupported_filter' }

  // `deflate` is the zlib wrapper the spec calls for; `deflate-raw` covers
  // producers that omit the two-byte header, which some do.
  for (const format of ['deflate', 'deflate-raw'] as const) {
    const out = await tryInflate(object.raw, format)
    if (out !== null) return { ok: true, bytes: out }
  }
  return { ok: false, failure: 'stream_undecodable' }
}

async function tryInflate(
  raw: Uint8Array,
  format: 'deflate' | 'deflate-raw',
): Promise<Uint8Array | null> {
  try {
    // A ReadableStream rather than a Blob, and with no type argument.
    //
    // Blob is typed through the DOM's `BlobPart`, which this package does not
    // pull in; a subarray's `ArrayBufferLike` backing does not satisfy it in
    // any case. The remaining candidates are environment-specific — Node
    // declares the sink as `WritableStream<NodeJS.BufferSource>`, a name that
    // does not exist in the browser-typed app that imports this — so the
    // parameter is left off rather than tying this file to one of them.
    // Runtime behaviour is identical in both; only the annotation differs.
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue(raw)
        controller.close()
      },
    })
    const inflated = source.pipeThrough(new DecompressionStream(format))
    return new Uint8Array(await new Response(inflated).arrayBuffer())
  } catch {
    return null
  }
}
