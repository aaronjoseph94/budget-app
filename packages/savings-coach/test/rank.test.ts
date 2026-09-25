import { describe, expect, it } from 'vitest'
import { factsDigest } from '@budget/core'
import { rankCards } from '../src/index.js'
import { EVERY_KIND, FACTS, WIN_FACTS, factOf } from './fixtures.js'

const none = new Set<string>()
const keys = (facts = FACTS, dismissed: ReadonlySet<string> = none) => rankCards({ facts, dismissed }).cards.map((c) => c.fact.key)
/** The fixture with a fresh statement and nothing waiting. */
const fresh = factsDigest({ ...EVERY_KIND, latestStatementEnd: EVERY_KIND.asOf, pendingCount: 0 }).facts
const drop = (facts: typeof FACTS, key: string) => facts.filter((f) => f.key !== key)

describe('rankCards', () => {
  it('puts stale data first and Review second, then the biggest notable fact', () => {
    expect(keys()).toEqual(['data:stale', 'review:waiting', 'cat:dining:change'])
  })

  it('shows at most three, at most two to watch, one per category, and a win when there is one', () => {
    // Dining out (watch), Groceries (good), then Fun's pace (watch); Fuel's
    // over budget would be a third to watch, and Fun's near a second for Fun.
    expect(keys(fresh)).toEqual(['cat:dining:change', 'cat:groceries:change', 'cat:fun:pace'])
    expect(keys(drop(fresh, 'cat:groceries:change'))).toEqual(['cat:dining:change', 'cat:fun:pace'])
  })

  it('gives a category one card, its biggest', () => {
    // Dining out made a win, and Fun's near weighed above Fuel: Fun's pace
    // and near are both to watch, and only the pace, the bigger, shows.
    const won = fresh
      .filter((f) => f.key !== 'cat:groceries:change')
      .map((f) => (f.key === 'cat:dining:change' ? { ...f, meaning: 'good' as const } : f.key === 'cat:fun:near_budget' ? { ...f, impact: 6_100 } : f))
    expect(keys(won)).toEqual(['cat:dining:change', 'cat:fun:pace', 'cat:fuel:over_budget'])
  })

  it('makes room for a win in the last place, unless stale data and Review take two', () => {
    // Groceries' fall made small: it ranks below Fun's pace, and still gets the last place.
    const small = drop(FACTS, 'review:waiting').map((f) => (f.key === 'cat:groceries:change' ? { ...f, impact: 1_000 } : f))
    expect(keys(small)).toEqual(['data:stale', 'cat:dining:change', 'cat:groceries:change'])
    // With both, the biggest thing to watch keeps the one place left.
    expect(keys()).not.toContain('cat:groceries:change')
  })

  it('never makes a card of a summary or of a fact that is not notable', () => {
    const cards = rankCards({ facts: fresh, dismissed: none }).cards
    for (const card of cards) {
      expect(card.fact.notable).toBe(true)
      expect(card.fact.subject.type).toBe('category')
    }
    const quiet = fresh.filter((f) => !f.notable)
    expect(rankCards({ facts: quiet, dismissed: none }).cards).toEqual([])
  })

  it('leaves out a dismissed cause, and the next one takes its place', () => {
    const dining = factOf('cat:dining:change')
    expect(keys(FACTS, new Set([dining.cause]))).toEqual(['data:stale', 'review:waiting', 'cat:groceries:change'])
  })

  it('gives each card its template and its one action', () => {
    const cards = rankCards({ facts: FACTS, dismissed: none }).cards
    expect(cards.map((c) => [c.template, c.action])).toEqual([
      ['stale_data', 'import'],
      ['rows_waiting', 'review'],
      ['change_up', 'see_month'],
    ])
    expect(rankCards({ facts: fresh, dismissed: none }).cards.map((c) => c.template)).toEqual(['change_up', 'change_down', 'budget_pace'])
  })

  it('cheers a milestone near the top, and sends both wins to the goals', () => {
    // A milestone is worth one step of its goal, 5 hours at $275.00, solid (F34): it outranks Dining out.
    const withWins = [...fresh, ...WIN_FACTS.filter((f) => f.notable)]
    const cards = rankCards({ facts: withWins, dismissed: none }).cards
    expect(cards.map((c) => [c.fact.key, c.template, c.action])).toEqual([
      ['goal:g1:milestone', 'goal_milestone', 'goals'],
      ['cat:dining:change', 'change_up', 'see_month'],
      ['cat:groceries:change', 'change_down', 'see_month'],
    ])
    expect(rankCards({ facts: [factOf('summary:saved')], dismissed: none }).cards.map((c) => [c.template, c.action])).toEqual([
      ['saved_more', 'goals'],
    ])
  })

  it('ranks by impact whatever order the facts come in', () => {
    expect(keys([...fresh].reverse())).toEqual(keys(fresh))
  })
})
