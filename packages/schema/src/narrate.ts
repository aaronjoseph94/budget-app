/**
 * The Coach's brief to the AI, and the AI's words back (plan §3.5, §3.6;
 * ADR 0005 §2, §4).
 *
 * The brief (`NarrateDaily`) is what the app sends: what kind of fact each
 * is, up or down, a little or a lot, how much history stands behind it,
 * the names of its blanks, the owner's names for things (masked and cut),
 * the goals by name, and a shortlist of quotes. It has no amount, balance
 * or date field at all, so none can be sent by mistake.
 *
 * The reply (`parseNarrateReply`) is the model-responses boundary: its
 * outer shape is parsed with zod, and then each string it holds is held to
 * the text rule on its own. A failing string drops only its own part, a
 * card or a line, and the app's own words show there instead; a reply
 * whose shape fails is dropped whole. Nothing is repaired. Which facts,
 * cards and quotes the words may name is savings-coach's checkReply's to
 * say, since only it knows what was offered.
 */
import { z } from 'zod'
import { proseProblem, type ProseProblem } from './prose.js'
import { replyValue } from './reply.js'

/** One or two capitals: a fact's letter in the brief, and in a blank. */
export const FACT_LETTER = /^[A-Z]{1,2}$/
/** A library entry's id: lowercase words and hyphens, no digit (plan §4). */
export const QUOTE_ID = /^[a-z]+(?:-[a-z]+)*$/

/**
 * The daily prompt's version. The helper's own constant is held to it by
 * a contract test, and the app hashes it into every signature, so words
 * written under an older prompt are never reused.
 */
export const NARRATE_PROMPT_VERSION = 1

/** Each field's length, and how many cards a pack may word (plan A12). */
export const NARRATE_LIMITS = { summary: 200, title: 80, body: 240, tryThis: 240, goal: 160, why: 160, cards: 5 } as const

/** What the brief may say of a fact. Every field is a word; none is a figure. */
export interface NarrateFact {
  readonly id: string
  readonly kind: string
  /** The owner's name for what it is about, runs of four or more digits masked, at most 40 characters. */
  readonly about: string
  readonly direction: 'up' | 'down' | 'same' | 'none'
  readonly size: 'slight' | 'clear' | 'big' | null
  readonly evidence: 'thin' | 'some' | 'solid'
  readonly meaning: 'good' | 'watch' | 'info'
  /** The blanks this fact offers, such as `change` for `{{A.change}}`. */
  readonly slots: readonly string[]
}

export interface NarrateGoal {
  readonly id: string
  readonly about: string
  readonly main: boolean
  /** Hours where the goal has a cost an hour, such as flight training; dollars otherwise. */
  readonly unit: 'hours' | 'dollars'
}

export interface NarrateQuote {
  readonly id: string
  readonly kind: 'quote' | 'tip'
  readonly text: string
  readonly by: string
}

/** The daily pack's brief (plan §3.5). */
export interface NarrateDaily {
  readonly tone: 'cheerleader' | 'straight'
  readonly facts: readonly NarrateFact[]
  /** The fact the day's line speaks of, or null with none. */
  readonly summary: string | null
  /** The facts to word as cards, most important first. */
  readonly cards: readonly string[]
  readonly goals: readonly NarrateGoal[]
  readonly quotes: readonly NarrateQuote[]
}

export interface NarrateCard {
  readonly fact: string
  readonly title: string
  readonly body: string
  /** The one thing to try, which every card that asks to watch something carries. */
  readonly tryThis: string | null
}

export interface NarrateReply {
  readonly summary: string | null
  readonly cards: readonly NarrateCard[]
  /** One line of encouragement for the goals, naming one by its blank. */
  readonly goal: string | null
  readonly quote: { readonly id: string; readonly why: string | null } | null
}

/** Which part a string was dropped from, and the rule it broke: codes only, safe to count. */
export interface NarrateDrop {
  readonly part: 'summary' | 'card' | 'tryThis' | 'goal' | 'why'
  readonly problem: ProseProblem
}

export type NarrateParsed =
  | { readonly ok: true; readonly reply: NarrateReply; readonly dropped: readonly NarrateDrop[] }
  | { readonly ok: false }

// The outer shape only: each string's own rule is applied below, one at a
// time, so one bad sentence cannot take the others with it. Fields beyond
// these are dropped, never passed on.
const Text = z.string().max(4000)
const ReplyShape = z.object({
  summary: Text.nullable(),
  cards: z.array(z.object({ fact: z.string().regex(FACT_LETTER), title: Text, body: Text, tryThis: Text.nullable() })).max(NARRATE_LIMITS.cards),
  goal: Text.nullable(),
  quote: z.object({ id: z.string().regex(QUOTE_ID), why: Text.nullable() }).nullable(),
})

/**
 * A model's reply, or words read back from ai_notes, which are model output
 * too and are held to the same rule again. Takes the reply's text or the
 * stored object.
 */
export function parseNarrateReply(raw: unknown): NarrateParsed {
  const json = replyValue(raw)
  if (!json.ok) return { ok: false }
  const shape = ReplyShape.safeParse(json.value)
  if (!shape.success) return { ok: false }
  const dropped: NarrateDrop[] = []
  // The words as checked, NFKC-normalised, or null when they broke the rule.
  const kept = (part: NarrateDrop['part'], text: string, limit: number): string | null => {
    const problem = proseProblem(text, limit)
    if (problem === null) return text.normalize('NFKC')
    dropped.push({ part, problem })
    return null
  }
  const { summary, cards, goal, quote } = shape.data
  const L = NARRATE_LIMITS
  return {
    ok: true,
    reply: {
      summary: summary === null ? null : kept('summary', summary, L.summary),
      cards: cards.flatMap((c) => {
        const title = kept('card', c.title, L.title)
        const body = title === null ? null : kept('card', c.body, L.body)
        if (title === null || body === null) return []
        return [{ fact: c.fact, title, body, tryThis: c.tryThis === null ? null : kept('tryThis', c.tryThis, L.tryThis) }]
      }),
      goal: goal === null ? null : kept('goal', goal, L.goal),
      quote: quote === null ? null : { id: quote.id, why: quote.why === null ? null : kept('why', quote.why, L.why) },
    },
    dropped,
  }
}
