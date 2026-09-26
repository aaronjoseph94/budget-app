import { describe, expect, it } from 'vitest'
import { factsDigest } from '@budget/core'
import { forecastCard, rankCards } from '../src/index.js'
import { EVERY_KIND, FACTS, SHOP_FACTS, WIN_FACTS, factOf, forecastOf } from './fixtures.js'

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

  it('sends each detector’s card to the shops, and gives a shop one card (F38, F39)', () => {
    const one = (key: string) => rankCards({ facts: [factOf(key)], dismissed: none }).cards.map((c) => [c.template, c.action])
    expect(one('shop:SPOTIFY:price_rise')).toEqual([['price_rise', 'shops']])
    expect(one('shop:GYM:new_subscription')).toEqual([['new_subscription', 'shops']])
    expect(one('charge:big:large')).toEqual([['large_charge', 'shops']])
    expect(one('charge:sofa:new_shop')).toEqual([['new_shop', 'shops']])
    expect(one('charges:k1:k2:possible_double')).toEqual([['possible_double', 'shops']])
    expect(one('charges:t1:t2:counted_twice')).toEqual([['counted_twice', 'shops']])
    // A repeat at CAFE, beside CAFE's large charge: one card for the shop, the bigger.
    const again = { ...factOf('charges:k1:k2:possible_double'), key: 'charges:c9:c10:possible_double', subject: factOf('charge:big:large').subject }
    expect(keys([again, factOf('charge:big:large')])).toEqual(['charge:big:large'])
    expect(keys(SHOP_FACTS)).toHaveLength(2)
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

describe('forecastCard', () => {
  it('gives the forecast a card of its own, opening the Forecast, worded by its shape', () => {
    expect(forecastCard(forecastOf(500_000))).toMatchObject({ template: 'forecast', action: 'forecast' })
    expect(forecastCard(forecastOf(null))?.template).toBe('forecast_spent')
    expect(forecastCard(forecastOf(50_000))?.template).toBe('forecast_watch')
    expect(forecastCard(null)).toBeNull()
  })

  it('never ranks the forecast among the three', () => {
    expect(keys([...FACTS, forecastOf(50_000)])).toEqual(keys())
  })
})
