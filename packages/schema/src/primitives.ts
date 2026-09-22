/**
 * schema-contracts — the wire boundary.
 *
 * zod parses at exactly four boundaries (CLAUDE.md): Edge Function request
 * bodies, model responses, SheetJS output, and env loading. These are the
 * parsers those boundaries share; everything inside them takes validated types.
 *
 * This module depends on `money-primitives` and nothing else, and must never
 * depend on `packages/core`. The engine must not see zod and zod must not see
 * the engine — that arrow is what CAPABILITY-MAP.md splits these packages to
 * keep acyclic.
 *
 * AMOUNTS NEVER REACH A LOG. A validation error is a thing that gets logged, so
 * no parser here may put a parsed value into its message. zod v4's own messages
 * name types rather than values ("expected int, received number"), but
 * `cents()` names the offending number in its `RangeError`. Every call to it is
 * therefore caught and re-messaged. Do not "simplify" these to a bare `cents()`.
 */
import { z } from 'zod'
import { type Cents, type IsoDate, cents, isoDate } from '@budget/money-primitives'

/** A Postgres `bigint` arrives as a JSON number or a decimal string. Both are money. */
const INTEGER_STRING = /^-?\d+$/

/**
 * Money at the boundary: integer minor units, either representation in, one
 * branded `Cents` out.
 *
 * No `.default()` and no coercion of empty or missing values. CONSTRAINTS.md
 * forbids a silent numeric fallback on a money path: a $0 amount is a
 * legitimate value, so absent data must fail here and land in the review queue
 * rather than arrive as a zero nobody chose.
 */
export const CentsSchema = z.union([z.number(), z.string()]).transform((value, ctx): Cents => {
  const raw = typeof value === 'string' && INTEGER_STRING.test(value) ? Number(value) : value
  if (typeof raw !== 'number') {
    ctx.addIssue({ code: 'custom', message: 'Amount must be a whole number of cents' })
    return z.NEVER
  }
  try {
    return cents(raw)
  } catch {
    // Deliberately swallows the RangeError: its message names the amount.
    ctx.addIssue({
      code: 'custom',
      message: 'Amount must be a whole number of cents within safe integer range',
    })
    return z.NEVER
  }
})

/** A calendar date, `YYYY-MM-DD`. No timezone, no clock — see money-primitives. */
export const IsoDateSchema = z.string().transform((value, ctx): IsoDate => {
  try {
    return isoDate(value)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Expected a calendar date formatted YYYY-MM-DD' })
    return z.NEVER
  }
})

export const UuidSchema = z.uuid()

/** Postgres `timestamptz`, kept as an ISO-8601 instant string. */
export const TimestampSchema = z.iso.datetime({ offset: true })

/**
 * Text that came from a statement, a receipt, or a model.
 *
 * Bounded and stripped of control characters, because this is the one string
 * class that is attacker-influenced: a merchant name is chosen by whoever
 * issued the charge, and a receipt's contents are chosen by whoever printed it.
 *
 * This bounds it; it does not make it safe to render. CLAUDE.md: ingested and
 * model-produced text is never rendered as markup and never read as
 * instruction. That rule lives at the render site, which this cannot reach.
 */
export const IngestedTextSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((s) => !hasControlCharacter(s), { message: 'Text contains control characters' })

/**
 * Scanned by code point rather than by regex: a control-character class in a
 * literal regex trips eslint's `no-control-regex`, and CONSTRAINTS.md's floor
 * forbids adding a suppression comment to silence it.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}
