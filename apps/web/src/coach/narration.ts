/**
 * Which words the Coach shows for each part of the day: the app's own, or
 * the AI's where they still fit (plan §3.8, ADR 0005 §5, §6).
 *
 * The app's own words are made first and are always complete. The AI's
 * replace them part by part: the whole pack when its signature matches
 * today's brief, else each line, card or goal line whose own signature
 * matches one kept in a recent note. A part the AI's words cannot fill,
 * because a letter they name is no longer among today's facts, keeps the
 * app's words. Every figure is filled from today's facts as it is drawn,
 * so reused words never carry yesterday's numbers.
 */
import type { Fact } from '@budget/core'
import { GOAL_LINE_TEMPLATES, cardWords, type Card, type LibraryEntry, type ModelPayload, type PayloadGoal, type Tone } from '@budget/savings-coach'
import type { NarrateReply } from '@budget/schema'
import type { Note } from './ai-cache.js'
import type { Named } from './words.js'

export interface Words {
  readonly text: string
  /** Each letter the text may name. */
  readonly names: Readonly<Record<string, Named>>
  /** Written by the AI, and so labelled ✨. */
  readonly ai: boolean
}

export interface CardText {
  readonly title: Words
  readonly body: Words
  readonly tryThis: Words | null
}

export interface Narration {
  readonly line: Words | null
  /** By the card's fact key. */
  readonly cards: ReadonlyMap<string, CardText>
  readonly goal: Words | null
  /** The AI's pick from today's shortlist, with why it fits; null for the app's own pick. */
  readonly quote: { readonly id: string; readonly why: Words | null } | null
}

/** What today's words are about: the line, the cards, the active goals (main first) and the quote shortlist. */
export interface Day {
  readonly tone: Tone
  readonly line: { readonly fact: Fact; readonly text: string } | null
  readonly cards: readonly Card[]
  readonly goals: readonly PayloadGoal[]
  readonly quotes: readonly LibraryEntry[]
}

/** Today's signatures: the whole brief's, and each part's by its fact key (`goals` for the goal line). */
export interface Signed {
  readonly factsSig: string
  readonly parts: ReadonlyMap<string, string>
}

export const GOAL_PART = 'goals'
const goalName = (g: PayloadGoal): Named => ({ subject: { label: g.name }, figures: {} })

/** The app's own words for every part, in the owner's tone. */
export function ownWords(day: Day): Narration {
  const cards = new Map(
    day.cards.map((card): [string, CardText] => {
      const words = cardWords(card.template, day.tone)
      const own = (text: string): Words => ({ text, names: { A: card.fact }, ai: false })
      return [card.fact.key, { title: own(words.title), body: own(words.body), tryThis: words.tryThis === null ? null : own(words.tryThis) }]
    }),
  )
  const main = day.goals[0]
  return {
    line: day.line === null ? null : { text: day.line.text, names: { A: day.line.fact }, ai: false },
    cards,
    goal: main === undefined ? null : { text: GOAL_LINE_TEMPLATES[day.tone], names: { A: goalName(main) }, ai: false },
    quote: null,
  }
}

/** Today's facts and goals by stable key. */
function liveByKey(day: Day): ReadonlyMap<string, Named> {
  return new Map<string, Named>([
    ...(day.line === null ? [] : [[day.line.fact.key, day.line.fact] as const]),
    ...day.cards.map((c) => [c.fact.key, c.fact] as const),
    ...day.goals.map((g) => [`goal:${g.id}`, goalName(g)] as const),
  ])
}

/** The AI's text, with each letter it names found among today's facts; null when one is gone. */
function aiWords(text: string | null, keys: Readonly<Record<string, string>>, live: ReadonlyMap<string, Named>): Words | null {
  if (text === null) return null
  const names: Record<string, Named> = {}
  for (const [, letter] of text.matchAll(/\{\{([A-Z]{1,2})\.[a-z_]+\}\}/g)) {
    const found = live.get(keys[letter!] ?? '')
    if (found === undefined) return null
    names[letter!] = found
  }
  return { text, names, ai: true }
}

/** One card's AI words, when all of them can be drawn; a watch card keeps its one thing to try. */
function aiCard(card: NarrateReply['cards'][number], keys: Readonly<Record<string, string>>, live: ReadonlyMap<string, Named>): CardText | null {
  const title = aiWords(card.title, keys, live)
  const body = aiWords(card.body, keys, live)
  const tryThis = aiWords(card.tryThis, keys, live)
  if (title === null || body === null || (card.tryThis !== null && tryThis === null)) return null
  return { title, body, tryThis }
}

/** The AI's words from one reply, over the app's own, part by part. `only` limits which parts may be taken. */
function overlay(base: Narration, day: Day, reply: NarrateReply, keys: Readonly<Record<string, string>>, only: (part: string, letter: string | null) => boolean): Narration {
  const live = liveByKey(day)
  const letterOf = (key: string) => Object.entries(keys).find(([, k]) => k === key)?.[0] ?? null
  const lineKey = day.line?.fact.key
  const line = lineKey !== undefined && only(lineKey, letterOf(lineKey)) ? aiWords(reply.summary, keys, live) : null
  const cards = new Map(base.cards)
  for (const card of reply.cards) {
    const key = keys[card.fact]
    if (key === undefined || !cards.has(key) || !only(key, card.fact)) continue
    const words = aiCard(card, keys, live)
    // A card to watch that would lose its one thing to try keeps the app's words.
    const watch = day.cards.find((c) => c.fact.key === key)?.fact.meaning === 'watch'
    if (words !== null && (words.tryThis !== null || !watch)) cards.set(key, words)
  }
  const goal = only(GOAL_PART, null) ? aiWords(reply.goal, keys, live) : null
  // A quote pick belongs to its whole pack, which has no part signature of its own.
  const quote = reply.quote !== null && only('quote', null) && day.quotes.some((q) => q.id === reply.quote?.id) ? { id: reply.quote.id, why: aiWords(reply.quote.why, keys, live) } : null
  return { line: line ?? base.line, cards, goal: goal ?? base.goal, quote: quote ?? base.quote }
}

/** A reply just checked against today's brief: its letters are the brief's. */
export function fromReply(day: Day, payload: ModelPayload, reply: NarrateReply): Narration {
  return overlay(ownWords(day), day, reply, payload.keys, () => true)
}

/**
 * `whole`: a note matched today's whole brief, so nothing new is worth
 * asking for. `uncovered` of the `total` line and cards have only the
 * app's words. `provider` wrote the newest AI words shown, if any are.
 */
export interface Reused {
  readonly narration: Narration
  readonly whole: boolean
  readonly uncovered: number
  readonly total: number
  readonly provider: Note['provider'] | null
}

/** Today's words, reusing kept notes where their signatures still match (ADR 0005 §6). */
export function reuse(day: Day, signed: Signed, notes: readonly Note[]): Reused {
  let narration = ownWords(day)
  let provider: Note['provider'] | null = null
  const exact = notes.find((n) => n.factsSig === signed.factsSig)
  if (exact !== undefined) {
    narration = overlay(narration, day, exact.body, exact.factKeys, () => true)
    provider = exact.provider
  } else {
    // Oldest first, so the newest words for each part win.
    for (const note of [...notes].reverse()) {
      const matches = (part: string, letter: string | null) => {
        const sig = signed.parts.get(part)
        if (sig === undefined) return false
        if (letter !== null) return note.cardSigs[letter] === sig
        return Object.values(note.cardSigs).includes(sig)
      }
      const next = overlay(narration, day, note.body, note.factKeys, matches)
      const moved = next.line !== narration.line || next.goal !== narration.goal || [...next.cards].some(([k, v]) => narration.cards.get(k) !== v)
      if (moved) provider = note.provider
      narration = next
    }
  }
  const parts = [...(narration.line === null ? [] : [narration.line]), ...[...narration.cards.values()].map((c) => c.body)]
  const uncovered = parts.filter((w) => !w.ai).length
  return { narration, whole: exact !== undefined, uncovered, total: parts.length, provider }
}
