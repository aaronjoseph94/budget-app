/**
 * Today's signatures (ADR 0005 §6): the whole brief's, and each part's, the
 * day's line, each card and the goal line, hashed with WebCrypto from
 * savings-coach's canonical texts. A note keeps each part's signature under
 * the letter it had in that note's brief, the goal line's under the main
 * goal's letter, so a later day can find it under different letters.
 */
import { canonicalPayload, cardSignature, goalLineSignature, type ModelPayload } from '@budget/savings-coach'
import { signatureOf } from './ai-cache.js'
import { GOAL_PART, type Day, type Signed } from './narration.js'

/** Today's signatures: the whole brief, and each part of it. */
export async function sign(day: Day, payload: ModelPayload): Promise<Signed> {
  const parts: [string, string][] = []
  if (day.line !== null) {
    const { fact } = day.line
    parts.push([fact.key, await signatureOf(cardSignature({ fact, template: `line:${fact.kind}:${fact.meaning}`, tone: day.tone }))])
  }
  for (const card of day.cards) parts.push([card.fact.key, await signatureOf(cardSignature({ fact: card.fact, template: card.template, tone: day.tone }))])
  if (day.goals.length > 0) parts.push([GOAL_PART, await signatureOf(goalLineSignature(day.goals, day.tone))])
  return { factsSig: await signatureOf(canonicalPayload(payload.brief)), parts: new Map(parts) }
}

/** Each part's signature under its letter in this brief; the goal line's under the main goal's. */
export function sigsByLetter(payload: ModelPayload, signed: Signed): Record<string, string> {
  const main = payload.brief.goals.find((g) => g.main)?.id
  return Object.fromEntries(
    Object.entries(payload.keys).flatMap(([letter, key]) => {
      const sig = letter === main ? signed.parts.get(GOAL_PART) : signed.parts.get(key)
      return sig === undefined ? [] : [[letter, sig]]
    }),
  )
}
