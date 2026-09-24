/**
 * Which facts become the Coach's cards (plan §2.3, F44, ADR 0005 §1).
 *
 * At most three, because a coach that says everything says nothing
 * (docs/ideas/insights.md). Stale data comes first, since a stale ledger
 * makes every other card confidently wrong; rows waiting in Review second;
 * then notable facts by impact. One card per category, at most two to
 * watch, and a win when there is one, so the Coach never reads as a list
 * of faults. A dismissed cause stays out; a new cause for the same thing
 * comes back.
 */
import type { Fact } from '@budget/core'
import { type CardTemplateKey, cardTemplateKey } from './templates.js'

/** The card's one action: bring in a statement, open Review, or see the month. */
export type CardAction = 'import' | 'review' | 'see_month'

export interface Card {
  readonly fact: Fact
  readonly template: CardTemplateKey
  readonly action: CardAction
}

export interface RankCardsInput {
  /** From factsDigest, in any order. */
  readonly facts: readonly Fact[]
  /** Causes the owner dismissed (A17 stores them; none until then). */
  readonly dismissed: ReadonlySet<string>
}

const MAX_CARDS = 3
const MAX_WATCH = 2
const FIRST: Readonly<Partial<Record<Fact['kind'], number>>> = { stale_data: 0, rows_waiting: 1 }

export function rankCards(input: RankCardsInput): { readonly cards: readonly Card[] } {
  const eligible = input.facts
    .flatMap((fact) => {
      const template = cardTemplateKey(fact)
      return fact.notable && template !== null && !input.dismissed.has(fact.cause) ? [{ fact, template }] : []
    })
    .sort((a, b) => order(a.fact) - order(b.fact) || b.fact.impact - a.fact.impact || (a.fact.key < b.fact.key ? -1 : 1))

  const picked: typeof eligible = []
  for (const candidate of eligible) {
    if (picked.length === MAX_CARDS) break
    const watching = picked.filter((p) => p.fact.meaning === 'watch').length
    if (candidate.fact.meaning === 'watch' && watching === MAX_WATCH) continue
    if (sharesCategory(candidate.fact, picked)) continue
    picked.push(candidate)
  }

  // A win takes the last place from the lowest thing to watch, unless stale
  // data and Review hold two places: then the biggest thing to watch keeps
  // the one left, since a win cannot outweigh the only warning.
  if (!picked.some((p) => p.fact.meaning === 'good')) {
    const watches = picked.filter((p) => p.fact.meaning === 'watch')
    const room = picked.length < MAX_CARDS ? null : watches.length >= 2 ? watches[watches.length - 1]! : undefined
    if (room !== undefined) {
      const kept = picked.filter((p) => p !== room)
      const win = eligible.find((e) => e.fact.meaning === 'good' && !sharesCategory(e.fact, kept))
      if (win !== undefined) {
        picked.length = 0
        picked.push(...eligible.filter((e) => e === win || kept.includes(e)))
      }
    }
  }
  return { cards: picked.map(({ fact, template }) => ({ fact, template, action: actionFor(fact) })) }
}

function order(fact: Fact): number {
  return FIRST[fact.kind] ?? 2
}

function sharesCategory(fact: Fact, picked: readonly { readonly fact: Fact }[]): boolean {
  return fact.subject.type === 'category' && picked.some((p) => p.fact.subject.type === 'category' && p.fact.subject.id === fact.subject.id)
}

function actionFor(fact: Fact): CardAction {
  return fact.kind === 'stale_data' ? 'import' : fact.kind === 'rows_waiting' ? 'review' : 'see_month'
}
