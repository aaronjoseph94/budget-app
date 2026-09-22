/**
 * Builds small PDFs for the reader's tests.
 *
 * Exists because the reader cannot be tested against a real statement: those
 * are card exports, which CLAUDE.md does not permit in the repository, and one
 * would carry a real card number, a real address and real spending. Every
 * fixture here is synthetic — invented merchants, invented amounts — and is
 * built rather than checked in, so a reviewer can see exactly what the bytes
 * contain instead of taking a binary blob on trust.
 *
 * It writes the same constructs a bank's PDF generator does: Flate-compressed
 * content streams, text positioned with Tm and Td, literal and hex strings,
 * and TJ arrays with kerning advances.
 */

const encoder = new TextEncoder()

export interface Cell {
  readonly x: number
  readonly y: number
  readonly text: string
}

async function deflate(input: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(input)
      controller.close()
    },
  })
  const stream = source.pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** A content stream that draws each cell at its own position with Tm. */
export function contentFor(cells: readonly Cell[]): string {
  const drawn = cells
    .map((c) => `BT /F0 9 Tf 1 0 0 1 ${c.x} ${c.y} Tm (${escapeLiteral(c.text)}) Tj ET`)
    .join('\n')
  return `${drawn}\n`
}

function escapeLiteral(text: string): string {
  return text.replace(/([\\()])/gu, '\\$1')
}

export interface BuildOptions {
  /** Leave the content stream uncompressed, with no /Filter. */
  readonly uncompressed?: boolean
  /** Declare a /Length that overruns the object, as some producers do. */
  readonly lyingLength?: boolean
  /** Add an /Encrypt reference to the trailer. */
  readonly encrypted?: boolean
  /** Emit pages with no text-showing operators at all. */
  readonly noTextLayer?: boolean
}

/**
 * Assemble a PDF from one content stream per page.
 *
 * Object numbering is deliberate: page objects ascend in page order, because
 * that is the ordering the reader relies on and a test that did not exercise
 * it would not be testing the real thing.
 */
export async function buildPdf(
  pages: readonly string[],
  options: BuildOptions = {},
): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  const push = (s: string): void => {
    parts.push(encoder.encode(s))
  }

  push('%PDF-1.7\n')
  push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`)

  const pageIds = pages.map((_p, i) => 3 + i * 2)
  push(
    `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>\nendobj\n`,
  )

  for (let i = 0; i < pages.length; i += 1) {
    const pageId = 3 + i * 2
    const contentId = pageId + 1
    push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Contents ${contentId} 0 R >>\nendobj\n`,
    )

    const source = encoder.encode(options.noTextLayer === true ? '0 0 m 100 100 l S\n' : pages[i])
    const body = options.uncompressed === true ? source : await deflate(source)
    const filter = options.uncompressed === true ? '' : ' /Filter /FlateDecode'
    const declared = options.lyingLength === true ? body.byteLength + 5000 : body.byteLength

    push(`${contentId} 0 obj\n<< /Length ${declared}${filter} >>\nstream\n`)
    parts.push(body)
    push('\nendstream\nendobj\n')
  }

  const encrypt = options.encrypted === true ? ' /Encrypt 99 0 R' : ''
  push(`trailer\n<< /Size ${3 + pages.length * 2} /Root 1 0 R${encrypt} >>\n%%EOF\n`)

  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  return out
}
