/**
 * Which facts become the Coach's cards (plan §2.3, F44, ADR 0005 §1).
 *
 * At most three, because a coach that says everything says nothing
 * (docs/ideas/insights.md). Stale data comes first, since a stale ledger
 * makes every other card confidently wrong; rows waiting in Review second;
 * then notable facts by impact. One card per category or shop, at most two to
 * watch, and a win when there is one, so the Coach never reads as a list
 * of faults. A dismissed cause stays out; a new cause for the same thing
 * comes back.
 */
import type { Fact } from '@budget/core'
import { type CardTemplateKey, cardTemplateKey } from './templates.js'

/** The card's one action: bring in a statement, open Review, see the month, see the goals, open the Forecast, or see the shops. */
export type CardAction = 'import' | 'review' | 'see_month' | 'goals' | 'forecast' | 'shops'

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
    if (sharesSubject(candidate.fact, picked)) continue
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
      const win = eligible.find((e) => e.fact.meaning === 'good' && !sharesSubject(e.fact, kept))
      if (win !== undefined) {
        picked.length = 0
        picked.push(...eligible.filter((e) => e === win || kept.includes(e)))
      }
    }
  }
  return { cards: picked.map(({ fact, template }) => ({ fact, template, action: actionFor(fact) })) }
}

/**
 * The forecast's own card (plan §2.3, A13), apart from the three ranked
 * ones: worded like them, by the app or the AI, and opening the Forecast.
 * None when it is too early to forecast.
 */
export function forecastCard(fact: Fact | null): Card | null {
  const template = fact === null ? null : cardTemplateKey(fact)
  return fact === null || template === null ? null : { fact, template, action: 'forecast' }
}

function order(fact: Fact): number {
  return FIRST[fact.kind] ?? 2
}

/** A category, or a shop (a large charge and a repeat at one shop are one card), already has its card. */
function sharesSubject(fact: Fact, picked: readonly { readonly fact: Fact }[]): boolean {
  const { type, id } = fact.subject
  return (type === 'category' || type === 'shop') && id !== null && picked.some((p) => p.fact.subject.type === type && p.fact.subject.id === id)
}

function actionFor(fact: Fact): CardAction {
  switch (fact.kind) {
    case 'stale_data':
      return 'import'
    case 'rows_waiting':
      return 'review'
    case 'saved_more':
    case 'goal_milestone':
      return 'goals'
    // Reports → Shops lists every subscription and flagged charge, and "Not a subscription".
    case 'price_rise':
    case 'new_subscription':
    case 'large_charge':
    case 'new_shop':
    case 'possible_double':
    case 'counted_twice':
      return 'shops'
    default:
      return 'see_month'
  }
}
