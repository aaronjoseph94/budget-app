/**
 * Just type it, as the AI is asked and as its answer comes back (plan A22,
 * §3.6, §3.9; ADR 0005 §7).
 *
 * The AI is asked only when statement-parsers' `parseQuickEntry` left a
 * field empty, and only about those fields (`missing`). It is sent what the
 * owner typed, today's date and the owner's categories under aliases, and
 * nothing else. The reply (`parseQuickAddReply`) is the model-responses
 * boundary: its outer shape is parsed with zod, then each field alone is
 * kept only when it was asked for and passes its own rule, so one bad field
 * drops only itself. What is kept only fills the typed form; the owner
 * still presses its button.
 *
 * THE AMOUNT MUST BE THE OWNER'S OWN. A model can read a number wrong or
 * make one up, so its amount is kept only when it is, word for word, one
 * of the words the owner typed, after NFKC and with spaces and currency
 * signs taken out. "12.00" for a typed "12" is dropped: the rule is the
 * owner's words, not their value. The app then reads it with its own
 * amount parser, and labels it "read by AI: check it".
 */
import { z } from 'zod'
import { IsoDateSchema } from './primitives.js'
import type { CategoriseCategory } from './categorise.js'

/** What one request may carry; the helper's zod holds it to the same. */
export const QUICK_ADD_LIMITS = { text: 300, categories: 200, shop: 120 } as const

export type QuickAddField = 'amount' | 'date' | 'shop' | 'category' | 'flow'

export interface QuickAddBrief {
  /** What the owner typed, at most 300 characters. */
  readonly text: string
  /** Today, `YYYY-MM-DD`, so "yesterday" can be read. */
  readonly today: string
  /** The fields the parser left empty: the only ones the AI is asked about, or kept from. */
  readonly missing: readonly QuickAddField[]
  readonly categories: readonly CategoriseCategory[]
}

/** The fields kept, each null when not asked for, not given or refused. */
export interface QuickAddPick {
  /** The owner's own word for the amount, spaces and currency signs taken out, for the app's amount parser. */
  readonly amount: string | null
  readonly date: string | null
  readonly shop: string | null
  readonly alias: string | null
  readonly flow: 'spent' | 'received' | null
}

/** `dropped` counts the fields refused, as a number only, never with their text. */
export type QuickAddParsed = { readonly ok: true; readonly pick: QuickAddPick; readonly dropped: number } | { readonly ok: false }

const Field = z.string().max(400).nullable().optional()
const ReplyShape = z.object({ amount: Field, date: Field, shop: Field, category: Field, flow: Field })

/** NFKC, then no spaces and no currency signs, as ADR 0005 §7 compares amounts. */
const bare = (s: string) => s.normalize('NFKC').replace(/[\s\p{Sc}]/gu, '')
/** A word as typed, less the punctuation a sentence puts after it. */
const words = (text: string) =>
  text
    .normalize('NFKC')
    .split(/\s+/u)
    .map((w) => bare(w).replace(/[,;:!?]+$/u, '').replace(/\.$/u, ''))

/** Whether the model's amount is one of the owner's own words. */
export function amountIsTyped(amount: string, text: string): boolean {
  const said = bare(amount)
  return /\d/u.test(said) && words(text).includes(said)
}

/** A model's answer for one line, held to what that line asked. */
export function parseQuickAddReply(raw: unknown, brief: QuickAddBrief): QuickAddParsed {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return { ok: false }
    }
  }
  const shape = ReplyShape.safeParse(value)
  if (!shape.success) return { ok: false }
  const asked = new Set(brief.missing)
  let dropped = 0
  const keep = <T>(field: QuickAddField, given: string | null | undefined, rule: (s: string) => T | null): T | null => {
    if (given === null || given === undefined || given.trim().length === 0) return null
    const kept = asked.has(field) ? rule(given.trim()) : null
    if (kept === null) dropped += 1
    return kept
  }
  const { amount, date, shop, category, flow } = shape.data
  const pick: QuickAddPick = {
    amount: keep('amount', amount, (s) => (amountIsTyped(s, brief.text) ? bare(s) : null)),
    date: keep('date', date, (s) => {
      const read = IsoDateSchema.safeParse(s)
      // Never after today, and never before last year began: a typed line is about recent money.
      return read.success && read.data <= brief.today && read.data.slice(0, 4) >= String(Number(brief.today.slice(0, 4)) - 1) ? read.data : null
    }),
    // The shop is the owner's words too: a name found in the line, never one the model made up.
    shop: keep('shop', shop, (s) =>
      s.length <= QUICK_ADD_LIMITS.shop && brief.text.normalize('NFKC').toLowerCase().includes(s.normalize('NFKC').toLowerCase()) ? s : null,
    ),
    alias: keep('category', category, (s) => (brief.categories.some((c) => c.alias === s) ? s : null)),
    flow: keep('flow', flow, (s) => (s === 'spent' || s === 'received' ? s : null)),
  }
  return { ok: true, pick, dropped }
}
