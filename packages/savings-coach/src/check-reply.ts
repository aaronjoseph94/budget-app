/**
 * What the AI wrote, against what it was offered (ADR 0005 §4, rules 8
 * and 9; plan §3.7).
 *
 * parseNarrateReply in packages/schema has already held every string to
 * the text rule. What only this side can check is what the words name:
 * a card may speak only of a fact it was offered as a card, and name only
 * its own fact's blanks; the day's line only the summary's; the goal line
 * only the goals, by name; a quote pick only an id on the shortlist, whose
 * "why" names nothing at all. And a sentence holding a change blank may
 * not say "rose" beside a fall, or "fell" beside a rise: the blank is
 * drawn with the engine's own direction word, so the sentence around it
 * must not contradict it, or repeat it ("$40.00 more more").
 *
 * A failing part is dropped alone and its place shows the app's own words;
 * a card that asks the owner to watch something and has lost its one thing
 * to try is dropped too, since a bare "you overspent" helps nobody.
 * Nothing is repaired. Each drop is a code, so drops can be counted.
 */
import type { NarrateCard, NarrateDaily, NarrateReply } from '@budget/schema'
import { renderSegments } from './segments.js'

export type CheckDropReason = 'not_offered' | 'twice' | 'stray_brace' | 'unknown_fact' | 'unknown_slot' | 'direction' | 'no_try'

export interface CheckDrop {
  readonly part: 'summary' | 'card' | 'tryThis' | 'goal' | 'quote' | 'why'
  readonly reason: CheckDropReason
}

export interface CheckReplyInput {
  readonly reply: NarrateReply
  /** The brief the reply answers. */
  readonly brief: NarrateDaily
}

export interface CheckedReply {
  readonly reply: NarrateReply
  readonly dropped: readonly CheckDrop[]
}

const word = (words: string) => new RegExp(`(?<!\\p{L})(?:${words})(?!\\p{L})`, 'iu')
const RISING = word('rose|rise|rises|rising|risen|up|higher|increase|increased|jumped|climbed|grew|more')
const FALLING = word('fell|fall|falls|falling|fallen|down|lower|decrease|decreased|dropped|shrank|less|fewer')
/** A direction word straight after a change blank, which already carries one. */
const REPEATED = /\{\{([A-Z]{1,2})\.change\}\}\s+(?:more|less|fewer|higher|lower)(?!\p{L})/iu

export interface SentenceProblemInput {
  readonly text: string
  /** Each fact the text may name, by letter, with its slots. */
  readonly slots: Readonly<Record<string, readonly string[]>>
  /** Which way a lettered fact went, for the direction check. */
  readonly directionOf: (letter: string) => string | undefined
}

/**
 * Rules 8 and 9 on one text (ADR 0005 §4): why it fails, or null. A blank
 * must name a fact and slot it was offered, and no sentence holding a
 * change blank may say a rise beside a fall, or repeat the blank's own
 * direction word. The daily pack and the month's review share it.
 */
export function sentenceProblem(input: SentenceProblemInput): CheckDropReason | null {
  const { text, directionOf } = input
  const read = renderSegments({ text, slots: input.slots })
  if (!read.ok) return read.reason
  if (REPEATED.test(text)) return 'direction'
  const contradicts = text.split(/(?<=[.!?])\s+|\n/).some((sentence) =>
    [...sentence.matchAll(/\{\{([A-Z]{1,2})\.change\}\}/g)].some((m) => {
      const direction = directionOf(m[1]!)
      const bare = sentence.replace(/\{\{[A-Z]{1,2}\.[a-z_]+\}\}/g, ' ')
      return (direction === 'down' && RISING.test(bare)) || (direction === 'up' && FALLING.test(bare))
    }),
  )
  return contradicts ? 'direction' : null
}

export function checkReply(input: CheckReplyInput): CheckedReply {
  const { brief, reply } = input
  const dropped: CheckDrop[] = []
  const factOf = new Map(brief.facts.map((f) => [f.id, f]))
  const slotsOf = (letters: readonly string[]): Record<string, readonly string[]> =>
    Object.fromEntries(
      letters.flatMap((l) => {
        const fact = factOf.get(l)
        if (fact !== undefined) return [[l, fact.slots]]
        return brief.goals.some((g) => g.id === l) ? [[l, ['name']]] : []
      }),
    )

  /** Why the text fails, naming only `letters`, or null when it passes. */
  const problem = (text: string, letters: readonly string[]): CheckDropReason | null =>
    sentenceProblem({ text, slots: slotsOf(letters), directionOf: (letter) => factOf.get(letter)?.direction })
  /** The text, or null with its drop noted. */
  const keep = (part: CheckDrop['part'], text: string | null, letters: readonly string[]): string | null => {
    if (text === null) return null
    const reason = problem(text, letters)
    if (reason === null) return text
    dropped.push({ part, reason })
    return null
  }

  let summary: string | null = null
  if (reply.summary !== null) {
    if (brief.summary === null) dropped.push({ part: 'summary', reason: 'not_offered' })
    else summary = keep('summary', reply.summary, [brief.summary])
  }

  const cards: NarrateCard[] = []
  for (const card of reply.cards) {
    if (!brief.cards.includes(card.fact)) {
      dropped.push({ part: 'card', reason: 'not_offered' })
      continue
    }
    if (cards.some((c) => c.fact === card.fact)) {
      dropped.push({ part: 'card', reason: 'twice' })
      continue
    }
    const own = [card.fact]
    const title = keep('card', card.title, own)
    const body = title === null ? null : keep('card', card.body, own)
    if (title === null || body === null) continue
    const tryThis = keep('tryThis', card.tryThis, own)
    if (tryThis === null && factOf.get(card.fact)?.meaning === 'watch') {
      dropped.push({ part: 'card', reason: 'no_try' })
      continue
    }
    cards.push({ fact: card.fact, title, body, tryThis })
  }

  let goal: string | null = null
  if (reply.goal !== null) {
    if (brief.goals.length === 0) dropped.push({ part: 'goal', reason: 'not_offered' })
    else goal = keep('goal', reply.goal, brief.goals.map((g) => g.id))
  }

  let quote: NarrateReply['quote'] = null
  if (reply.quote !== null) {
    if (!brief.quotes.some((q) => q.id === reply.quote?.id)) dropped.push({ part: 'quote', reason: 'not_offered' })
    else quote = { id: reply.quote.id, why: keep('why', reply.quote.why, []) }
  }

  return { reply: { summary, cards, goal, quote }, dropped }
}
