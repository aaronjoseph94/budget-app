/**
 * A PDF statement, from bytes to something the review queue can take.
 *
 * Three stages, each owned elsewhere: the PDF reader and the Rogers format in
 * statement-parsers, the reconciliation in core. This only chains them and
 * turns each refusal into a sentence.
 *
 * Reconciliation is a GATE, not a warning. A statement that does not add up to
 * the bank's own printed totals has been misread, and a misread import is
 * exactly what this design exists to keep out of the ledger. The user sees the
 * two figures that disagree and nothing is saved.
 */
import { reconcileStatement, type Reconciliation } from '@budget/core'
import {
  MAX_PDF_BYTES,
  readPdfText,
  readRogersStatement,
  type AcceptedRow,
  type RejectedRow,
  type StatementPeriod,
} from '@budget/statement-parsers'

export type PdfImport =
  | {
      readonly ok: true
      readonly period: StatementPeriod
      readonly parsed: number
      readonly accepted: readonly AcceptedRow[]
      readonly rejected: readonly RejectedRow[]
      readonly reconciliation: Reconciliation
    }
  | { readonly ok: false; readonly title: string; readonly detail: string }

const PDF_FAILURES: Record<string, { title: string; detail: string }> = {
  not_a_pdf: { title: 'That file is not a PDF', detail: 'Choose the statement PDF your bank provides.' },
  encrypted: {
    title: 'This PDF is password-protected',
    detail: 'Download an unprotected copy from your bank, or open it and use "Save as PDF" to make one.',
  },
  too_large: { title: 'This PDF is too large', detail: 'A statement is usually well under 10 MB.' },
  no_text_layer: {
    title: 'This PDF is a picture of a statement',
    detail:
      'It has no readable text; it was probably scanned. Download it from your bank’s website instead, for a PDF with real text.',
  },
  no_statement_period: {
    title: 'This is not a statement the app can read yet',
    detail: 'Right now the app reads Rogers Bank Mastercard statements. Other banks can be added.',
  },
  no_summary: {
    title: 'The statement’s totals could not be found',
    detail:
      'Without them there is nothing to check the import against, so nothing was imported. The app reads Rogers Bank Mastercard statements.',
  },
}

const fallback = {
  title: 'This PDF could not be read',
  detail: 'Nothing was imported. Try downloading the statement again.',
}

export async function readStatementPdf(bytes: Uint8Array): Promise<PdfImport> {
  const pdf = await readPdfText(bytes)
  if (!pdf.ok) return { ok: false, ...(PDF_FAILURES[pdf.failure] ?? fallback) }

  const statement = readRogersStatement(pdf.document.pages)
  if (!statement.ok) return { ok: false, ...(PDF_FAILURES[statement.failure] ?? fallback) }

  const { period, summary, parsed, accepted, rejected, statementAmountsCents } = statement.read
  return {
    ok: true,
    period,
    parsed,
    accepted,
    rejected,
    reconciliation: reconcileStatement({ amountsCents: statementAmountsCents, summary }),
  }
}

/**
 * A chosen file, refused by its size before any of it is read: reading a
 * huge file into memory is itself what would exhaust a phone (security-b-03).
 */
export async function readStatementFile(file: { readonly size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<PdfImport> {
  if (file.size > MAX_PDF_BYTES) return { ok: false, ...(PDF_FAILURES['too_large'] ?? fallback) }
  return readStatementPdf(new Uint8Array(await file.arrayBuffer()))
}
