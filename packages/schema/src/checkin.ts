/**
 * The Sunday check-in, as the AI is asked for it and as its words come
 * back (plan §2.4, §3.11 feature 7, A20; ADR 0005 §2, §4).
 *
 * The brief (`NarrateCheckin`) is facts as the daily brief gives them, with
 * no amount, balance or date field, and which of them each part is about:
 * the recap, the win and the one thing to try, and the goals by name for
 * the goal line. The reply (`parseCheckinReply`) is the model-responses
 * boundary: its outer shape is parsed with zod, then each string alone is
 * held to the text rule, so a bad sentence drops only itself and the app's
 * own words show in its place. What the words may name is
 * savings-coach's checkCheckinReply's to say.
 */
import { z } from 'zod'
import type { NarrateFact, NarrateGoal } from './narrate.js'
import { proseProblem, type ProseProblem } from './prose.js'

/**
 * The check-in's prompt version. The helper's own constant is held to it by
 * a contract test, and the app hashes it into the check-in's signature.
 */
export const CHECKIN_PROMPT_VERSION = 1

/** Each field's length. */
export const CHECKIN_LIMITS = { recap: 200, win: 160, tryThis: 200, goal: 160 } as const

export interface NarrateCheckin {
  readonly tone: 'cheerleader' | 'straight'
  readonly facts: readonly NarrateFact[]
  /** The fact the recap is about; null when the week is not covered. */
  readonly recap: string | null
  /** The fact the win is about; null for a general cheer. */
  readonly win: string | null
  /** The fact the one thing to try is about; null for a general one. */
  readonly tryThis: string | null
  /** The active goals, main first, named by their blank. */
  readonly goals: readonly NarrateGoal[]
}

export interface CheckinReply {
  readonly recap: string | null
  readonly win: string | null
  readonly tryThis: string | null
  readonly goal: string | null
}

export type CheckinPart = keyof CheckinReply

/** Which part a string was dropped from, and the rule it broke: codes only, safe to count. */
export interface CheckinDrop {
  readonly part: CheckinPart
  readonly problem: ProseProblem
}

export type CheckinParsed =
  | { readonly ok: true; readonly reply: CheckinReply; readonly dropped: readonly CheckinDrop[] }
  | { readonly ok: false }

// The outer shape only; fields beyond these are dropped, never passed on.
const Text = z.string().max(4000).nullable()
const ReplyShape = z.object({ recap: Text, win: Text, tryThis: Text, goal: Text })

/** A model's check-in, or one read back from ai_notes, held to the same rule again. */
export function parseCheckinReply(raw: unknown): CheckinParsed {
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
  const dropped: CheckinDrop[] = []
  const kept = (part: CheckinPart): string | null => {
    const text = shape.data[part]
    if (text === null) return null
    const problem = proseProblem(text, CHECKIN_LIMITS[part])
    if (problem === null) return text.normalize('NFKC')
    dropped.push({ part, problem })
    return null
  }
  return { ok: true, reply: { recap: kept('recap'), win: kept('win'), tryThis: kept('tryThis'), goal: kept('goal') }, dropped }
}
