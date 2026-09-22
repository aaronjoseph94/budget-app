/**
 * What a model says a receipt photo contains — parsed before anything uses it.
 *
 * CLAUDE.md names model responses as one of exactly four places zod parses,
 * and this is that parse. Nothing a model returns reaches the app, let alone
 * the ledger, without passing through here; and what passes is still only a
 * suggestion the user confirms, in the review queue, before it counts.
 *
 * The total is a STRING in a fixed format, never a number. A model asked for a
 * number hands back a float, and 14.23 as a float is 14.229999... — the exact
 * failure invariant 2 exists to rule out. "14.23" is parsed into integer cents
 * by the same parser that reads statements.
 */
import { z } from 'zod'
import { IngestedTextSchema, IsoDateSchema } from './primitives.js'

/** Digits, optionally a point and exactly two more. No sign, symbol or separator. */
const TOTAL = /^\d{1,7}(?:\.\d{2})?$/

const ReplySchema = z.object({
  readable: z.boolean(),
  merchant: IngestedTextSchema.nullable(),
  total: z.string().regex(TOTAL).nullable(),
  date: IsoDateSchema.nullable(),
})

export interface ReceiptReading {
  readonly merchant: string | null
  /** e.g. "14.23" — parse with parseAmountToCents, never Number(). */
  readonly total: string
  readonly date: string | null
}

export type ReceiptFailure = 'unreadable' | 'no_total' | 'model_output_invalid'

export type ReceiptOutcome =
  | { readonly ok: true; readonly reading: ReceiptReading }
  | { readonly ok: false; readonly failure: ReceiptFailure }

/**
 * Parse the model's raw reply text.
 *
 * Extra fields are dropped rather than passed on: a receipt is text chosen by
 * whoever printed it, and anything the model added beyond the four fields asked
 * for — an "instruction", a note — is not something this app acts on.
 */
export function parseReceiptReply(text: string): ReceiptOutcome {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, failure: 'model_output_invalid' }
  }

  const parsed = ReplySchema.safeParse(raw)
  if (!parsed.success) return { ok: false, failure: 'model_output_invalid' }

  const { readable, merchant, total, date } = parsed.data
  if (!readable) return { ok: false, failure: 'unreadable' }
  if (total === null) return { ok: false, failure: 'no_total' }
  return { ok: true, reading: { merchant, total, date } }
}
