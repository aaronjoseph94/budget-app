/**
 * Review's suggested categories, as the AI is asked for them and as its
 * picks come back (plan §2.8, §3.6, A21; ADR 0008).
 *
 * The brief (`CategoriseBrief`) holds, for each row, a number, the shop's
 * name masked and cut to 40 characters, whether it was spent or received
 * and a size band (F46); and the owner's categories, each under an alias,
 * `c1` to `c200`. No amount and no date. The reply
 * (`parseCategoriseReply`) is the model-responses boundary: its outer shape
 * is parsed with zod, then each pick alone is kept only for a row that was
 * sent, an alias that was offered and medium or high confidence, so a
 * wrong or steered pick drops only itself. A kept pick is still only a
 * suggestion the owner confirms.
 */
import { z } from 'zod'
import type { CategoryKind } from './enums.js'

/** What one request may carry: the helper's zod holds it to the same. */
export const CATEGORISE_LIMITS = { rows: 40, categories: 200, label: 40 } as const

/** `c1` to `c200`: a category as the AI sees it, never its id. */
export const CATEGORY_ALIAS = /^c(?:[1-9]|[1-9][0-9]|1[0-9][0-9]|200)$/

export interface CategoriseRow {
  /** 1 to 40, this row's number in the request. */
  readonly i: number
  readonly shop: string
  readonly flow: 'spent' | 'received'
  readonly size: 'small' | 'medium' | 'large'
}

export interface CategoriseCategory {
  readonly alias: string
  readonly name: string
  /** Its list. Not spending is never offered: 0018 refuses a suggestion onto it. */
  readonly list: Exclude<CategoryKind, 'transfer'>
}

export interface CategoriseBrief {
  readonly rows: readonly CategoriseRow[]
  readonly categories: readonly CategoriseCategory[]
}

export interface CategorisePick {
  readonly i: number
  readonly alias: string
  readonly confidence: 'medium' | 'high'
}

/** `dropped` counts the picks refused, as a number only, safe to count and never logged with text. */
export type CategoriseParsed = { readonly ok: true; readonly picks: readonly CategorisePick[]; readonly dropped: number } | { readonly ok: false }

// The outer shape decides whether anything is kept; each pick is judged alone.
const ReplyShape = z.object({ suggestions: z.array(z.unknown()).max(400) })
const PickShape = z.object({ i: z.int(), alias: z.string().max(8), confidence: z.enum(['low', 'medium', 'high']) })

/** A model's picks for one request, held to what that request offered. */
export function parseCategoriseReply(raw: unknown, brief: CategoriseBrief): CategoriseParsed {
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
  const rows = new Set(brief.rows.map((r) => r.i))
  const aliases = new Set(brief.categories.map((c) => c.alias))
  const picked = new Set<number>()
  const picks: CategorisePick[] = []
  for (const entry of shape.data.suggestions) {
    const pick = PickShape.safeParse(entry)
    if (!pick.success) continue
    const { i, alias, confidence } = pick.data
    if (confidence === 'low' || !rows.has(i) || !aliases.has(alias) || picked.has(i)) continue
    picked.add(i)
    picks.push({ i, alias, confidence })
  }
  return { ok: true, picks, dropped: shape.data.suggestions.length - picks.length }
}
