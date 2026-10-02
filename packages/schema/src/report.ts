/**
 * A month's review, as the AI is asked for it and as its words come back
 * (plan §3.11 feature 10, A15; ADR 0005 §2, §4).
 *
 * The brief (`NarrateReport`) is facts as the daily brief gives them, with
 * no amount, balance or date field, and which of them to word as the
 * review's three points and its one thing to try. The reply
 * (`parseReportReply`) is the model-responses boundary: its outer shape is
 * parsed with zod, then each string alone is held to the text rule, so a
 * bad sentence drops only itself and the app's own words show in its
 * place. What the words may name is savings-coach's checkReportReply's to
 * say, since only it knows what was offered.
 */
import { z } from 'zod'
import { FACT_LETTER, type NarrateFact } from './narrate.js'
import { proseProblem, type ProseProblem } from './prose.js'
import { replyValue } from './reply.js'

/**
 * The review's prompt version. The helper's own constant is held to it by a
 * contract test, and the app hashes it into the review's signature.
 */
export const REPORT_PROMPT_VERSION = 1

/** Each field's length, and how many points a review has. */
export const REPORT_LIMITS = { headline: 160, point: 200, tryThis: 200, points: 3 } as const

export interface NarrateReport {
  readonly tone: 'cheerleader' | 'straight'
  readonly facts: readonly NarrateFact[]
  /** The facts to word as the review's points, most important first. */
  readonly points: readonly string[]
  /** The fact the one thing to try is about, or null for a general one. */
  readonly tryThis: string | null
}

export interface ReportPoint {
  readonly fact: string
  readonly text: string
}

export interface ReportReply {
  readonly headline: string | null
  readonly points: readonly ReportPoint[]
  readonly tryThis: string | null
}

/** Which part a string was dropped from, and the rule it broke: codes only, safe to count. */
export interface ReportDrop {
  readonly part: 'headline' | 'point' | 'tryThis'
  readonly problem: ProseProblem
}

export type ReportParsed =
  | { readonly ok: true; readonly reply: ReportReply; readonly dropped: readonly ReportDrop[] }
  | { readonly ok: false }

// The outer shape only; fields beyond these are dropped, never passed on.
const Text = z.string().max(4000)
const ReplyShape = z.object({
  headline: Text.nullable(),
  points: z.array(z.object({ fact: z.string().regex(FACT_LETTER), text: Text })).max(REPORT_LIMITS.points),
  tryThis: Text.nullable(),
})

/** A model's review, or one read back from ai_notes, held to the same rule again. */
export function parseReportReply(raw: unknown): ReportParsed {
  const json = replyValue(raw)
  if (!json.ok) return { ok: false }
  const shape = ReplyShape.safeParse(json.value)
  if (!shape.success) return { ok: false }
  const dropped: ReportDrop[] = []
  const kept = (part: ReportDrop['part'], text: string, limit: number): string | null => {
    const problem = proseProblem(text, limit)
    if (problem === null) return text.normalize('NFKC')
    dropped.push({ part, problem })
    return null
  }
  const { headline, points, tryThis } = shape.data
  const L = REPORT_LIMITS
  return {
    ok: true,
    reply: {
      headline: headline === null ? null : kept('headline', headline, L.headline),
      points: points.flatMap((p) => {
        const text = kept('point', p.text, L.point)
        return text === null ? [] : [{ fact: p.fact, text }]
      }),
      tryThis: tryThis === null ? null : kept('tryThis', tryThis, L.tryThis),
    },
    dropped,
  }
}
