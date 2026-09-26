/**
 * Which quote or tip fits today (plan §4, ADR 0005 §8).
 *
 * The facts say what today is about; `quoteTags` turns them into the
 * library's tags, and `pickQuote` shortlists the entries sharing the most,
 * leaving out what this device showed in the last fortnight. A model (plan
 * A12) may choose one id from the shortlist and nothing else; without one,
 * the app takes the day's turn through it, so the pick holds all day and
 * moves on tomorrow, with no randomness.
 */
import { type Fact, dailyIndex } from '@budget/core'
import type { IsoDate } from '@budget/money-primitives'
import { LIBRARY, type LibraryEntry, type QuoteTag } from './library.js'

export interface PickQuoteInput {
  /** What today is about, most important first (quoteTags). */
  readonly tags: readonly QuoteTag[]
  readonly asOf: IsoDate
  /** Ids this device showed in the 14 days before today. */
  readonly recentIds: readonly string[]
  /** The committed library unless a test gives its own. */
  readonly library?: readonly LibraryEntry[]
}

export interface PickedQuote {
  /** At most six ids, the most tags shared first, then in the library's order. */
  readonly shortlist: readonly string[]
  /** The day's turn through the shortlist; null only for an empty library. */
  readonly entry: LibraryEntry | null
}

const SHORTLIST = 6

export function pickQuote(input: PickQuoteInput): PickedQuote {
  const library = input.library ?? LIBRARY
  const recent = new Set(input.recentIds)
  const fresh = library.filter((e) => !recent.has(e.id))
  // Everything shown lately: start the round again rather than show nothing.
  const pool = fresh.length === 0 ? library : fresh
  const wanted = new Set(input.tags)
  const shared = (e: LibraryEntry) => e.tags.filter((t) => wanted.has(t)).length
  const matching = pool.filter((e) => shared(e) > 0)
  // Array.prototype.sort is stable, so equals keep the library's order.
  const ranked = (matching.length === 0 ? pool : [...matching].sort((a, b) => shared(b) - shared(a))).slice(0, SHORTLIST)
  if (ranked.length === 0) return { shortlist: [], entry: null }
  const { index } = dailyIndex({ asOf: input.asOf, count: ranked.length })
  return { shortlist: ranked.map((e) => e.id), entry: ranked[index] ?? null }
}

/** The tags each kind of fact speaks to. */
function tagsOf(fact: Fact): readonly QuoteTag[] {
  switch (fact.kind) {
    case 'stale_data':
    case 'rows_waiting':
      return ['habits']
    case 'month_so_far':
    case 'week_so_far':
      return fact.meaning === 'watch' ? ['small_leaks'] : fact.meaning === 'good' ? ['saving'] : ['habits']
    case 'category_change':
      return fact.direction === 'up' ? ['small_leaks', 'impulse'] : ['habits', 'streaks']
    case 'category_trend':
      return fact.direction === 'up' ? ['small_leaks', 'habits'] : ['habits', 'streaks']
    case 'over_budget':
      return ['over_budget', 'enough']
    case 'near_budget':
      return ['over_budget']
    case 'budget_pace':
      return ['over_budget', 'levers']
    case 'saved_more':
      return ['saving', 'pay_yourself_first']
    case 'goal_milestone':
      return ['milestone', 'goal', 'courage']
    case 'month_forecast':
      return []
    case 'price_rise':
    case 'new_subscription':
      return ['subscriptions', 'small_leaks']
    case 'large_charge':
    case 'new_shop':
      return ['impulse', 'enough']
    case 'possible_double':
    case 'counted_twice':
      return ['habits']
  }
}

export interface QuoteTagsInput {
  /** Today's cards and line, most important first. */
  readonly facts: readonly Fact[]
  /** The main goal: hours where it has a cost an hour, flight where it is about flying. */
  readonly goal: { readonly name: string; readonly unitLabel: string | null; readonly hasHours: boolean } | null
}

export function quoteTags(input: QuoteTagsInput): readonly QuoteTag[] {
  const tags: QuoteTag[] = input.facts.flatMap(tagsOf)
  const { goal } = input
  if (goal !== null) {
    tags.push('goal')
    if (goal.hasHours) tags.push('hours')
    if (/\bfl(y|ying|ight)\b/i.test(`${goal.name} ${goal.unitLabel ?? ''}`)) tags.push('flight')
  }
  return [...new Set(tags)]
}
