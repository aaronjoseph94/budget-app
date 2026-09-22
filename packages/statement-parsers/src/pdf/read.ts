/**
 * A PDF's bytes to its pages of positioned text.
 *
 * The one entry point; objects.ts, text.ts and layout.ts are its parts.
 */

import { MAX_PDF_PAGES, inflateStream, splitObjects, type PdfFailure } from './objects.js'
import { extractRuns, type TextRun } from './text.js'

export interface PdfDocument {
  readonly pages: readonly (readonly TextRun[])[]
}

export type PdfReadOutcome =
  | { readonly ok: true; readonly document: PdfDocument }
  | { readonly ok: false; readonly failure: PdfFailure | 'no_text_layer' }

/**
 * Read every page's text.
 *
 * A page whose stream will not decode becomes an EMPTY page rather than
 * aborting the read: a statement's terms-and-conditions pages are of no
 * interest, and one unreadable page among fourteen should not cost the
 * thirteen that parsed. Losing a page that did hold transactions is caught
 * downstream, where the statement's own totals will not add up.
 *
 * A document with no text anywhere is reported as `no_text_layer` and not as
 * an empty result. That distinction is the difference between "this statement
 * has no transactions" and "this is a photograph of a statement", and the two
 * need opposite things from the user.
 */
export async function readPdfText(bytes: Uint8Array): Promise<PdfReadOutcome> {
  const split = splitObjects(bytes)
  if (!split.ok) return { ok: false, failure: split.failure }

  const { byId, contentIds } = split.objects
  if (contentIds.length === 0) return { ok: false, failure: 'no_pages' }

  const pages: Array<readonly TextRun[]> = []
  for (const id of contentIds.slice(0, MAX_PDF_PAGES)) {
    const object = byId.get(id)
    if (object === undefined) {
      pages.push([])
      continue
    }
    const inflated = await inflateStream(object)
    pages.push(inflated.ok ? extractRuns(inflated.bytes) : [])
  }

  const total = pages.reduce((n, page) => n + page.length, 0)
  if (total === 0) return { ok: false, failure: 'no_text_layer' }

  return { ok: true, document: { pages } }
}
