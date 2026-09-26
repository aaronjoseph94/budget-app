/**
 * The AI's brief for the daily pack, and the signatures its words are kept
 * under (plan §3.5, §3.6, §3.8; ADR 0005 §2, §6).
 *
 * The brief says what kind of fact each is, which way it went, how big
 * and how well founded, and the names of its blanks; the owner's names for
 * things, masked and cut; the goals by name; and a shortlist of quotes. It
 * never carries a figure: its type has no field an amount, a balance or a
 * date could go in. So the AI can only write words around blanks, and the
 * brief itself is a signature of the claims, which changes when a claim
 * does and never when a cent does.
 *
 * The signatures here are canonical texts; the app hashes them with
 * WebCrypto, so this package stays pure (plan §15).
 */
import type { Fact } from '@budget/core'
import type { NarrateDaily, NarrateFact, NarrateGoal } from '@budget/schema'
import type { LibraryEntry } from './library.js'
import { LIBRARY_VERSION } from './library.js'
import type { Card } from './rank.js'
import { slotsOf, type Tone } from './templates.js'

/** A goal as the brief names it: never its target or what it holds. */
export interface PayloadGoal {
  readonly id: string
  readonly name: string
  readonly main: boolean
  readonly hasHours: boolean
}

export interface ModelPayloadInput {
  readonly tone: Tone
  /** The fact the day's line speaks of, or null with none. */
  readonly line: Fact | null
  /** Today's cards, as rankCards gave them. */
  readonly cards: readonly Card[]
  /** The active goals, main first. */
  readonly goals: readonly PayloadGoal[]
  /** The quote shortlist, at most six (pickQuote). */
  readonly quotes: readonly LibraryEntry[]
  /** AI settings' Share shop names: off, a shop is sent as "a shop" (plan §3.6). */
  readonly shareShopNames: boolean
}

export interface ModelPayload {
  readonly brief: NarrateDaily
  /** Each letter's stable key: a fact's own, or `goal:<id>` for a goal. */
  readonly keys: Readonly<Record<string, string>>
}

/** A, B, … Z, then AA, AB, … AZ (ADR 0005 §2). */
export function letterOf(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `A${String.fromCharCode(39 + index)}`
}

const MAX_LABEL = 40

/** The owner's name for something as the AI may see it: runs of four or more digits masked, then cut. */
export function maskLabel(label: string): string {
  return [...label.replace(/\p{Nd}{4,}/gu, '#')].slice(0, MAX_LABEL).join('')
}

export function modelPayload(input: ModelPayloadInput): ModelPayload {
  const facts = [...(input.line === null ? [] : [input.line]), ...input.cards.map((c) => c.fact)]
  const keys: Record<string, string> = {}
  const briefFacts: NarrateFact[] = facts.map((fact, i) => {
    const id = letterOf(i)
    keys[id] = fact.key
    const { kind, direction, size, evidence, meaning } = fact
    const about = fact.subject.type === 'shop' && !input.shareShopNames ? 'a shop' : maskLabel(fact.subject.label)
    return { id, kind, about, direction, size, evidence, meaning, slots: slotsOf(fact) }
  })
  const goals: NarrateGoal[] = input.goals.map((goal, i) => {
    const id = letterOf(facts.length + i)
    keys[id] = `goal:${goal.id}`
    return { id, about: maskLabel(goal.name), main: goal.main, unit: goal.hasHours ? 'hours' : 'dollars' }
  })
  return {
    brief: {
      tone: input.tone,
      facts: briefFacts,
      summary: input.line === null ? null : 'A',
      cards: input.cards.map((_, i) => letterOf(i + (input.line === null ? 0 : 1))),
      goals,
      quotes: input.quotes.map((q) => ({ id: q.id, kind: q.kind, text: q.text, by: q.by })),
    },
    keys,
  }
}

/** JSON with every object's keys in order, so one meaning always has one text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined)
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * The text a pack's `facts_sig` hashes: the brief, with the library's
 * version. The app adds the prompt's version (packages/schema's
 * NARRATE_PROMPT_VERSION) as it hashes each signature, so words the
 * helper wrote under an older prompt are never reused.
 */
export function canonicalPayload(brief: NarrateDaily): string {
  return canonicalJson({ brief, library: LIBRARY_VERSION })
}

export interface CardSignatureInput {
  readonly fact: Fact
  /** Which of the app's templates words it: a card's, or the day's line's. */
  readonly template: string
  readonly tone: Tone
}

/**
 * The text one card's `card_sig` hashes (ADR 0005 §6): its kind, its fact's
 * stable key, its template, and its fact's direction, size and evidence,
 * with the tone. Words kept under it are reused only while
 * every one of those still holds; the figures in them are always filled
 * fresh as they are drawn.
 */
export function cardSignature(input: CardSignatureInput): string {
  const { fact } = input
  return canonicalJson({
    kind: fact.kind,
    key: fact.key,
    template: input.template,
    direction: fact.direction,
    size: fact.size,
    evidence: fact.evidence,
    meaning: fact.meaning,
    tone: input.tone,
  })
}

/** The text the goal line's signature hashes: which goals, which is the main one, and their units. */
export function goalLineSignature(goals: readonly PayloadGoal[], tone: Tone): string {
  return canonicalJson({ goals: goals.map((g) => ({ id: g.id, main: g.main, hours: g.hasHours })), tone })
}
