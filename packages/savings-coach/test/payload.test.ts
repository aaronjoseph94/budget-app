import { describe, expect, expectTypeOf, it } from 'vitest'
import { factsDigest, type Fact } from '@budget/core'
import type { NarrateDaily } from '@budget/schema'
import {
  LIBRARY,
  canonicalPayload,
  cardSignature,
  dayLine,
  goalLineSignature,
  letterOf,
  maskLabel,
  modelPayload,
  rankCards,
  type ModelPayloadInput,
} from '../src/index.js'
import { EVERY_KIND, FACTS, factOf } from './fixtures.js'

/** True when a number can be anywhere in T: the type an amount, a balance or a count would need. */
type CarriesNumber<T> = T extends number | bigint
  ? true
  : T extends string | boolean | null | undefined
    ? false
    : T extends readonly (infer U)[]
      ? CarriesNumber<U>
      : T extends object
        ? true extends { [K in keyof T]-?: CarriesNumber<T[K]> }[keyof T]
          ? true
          : false
        : true

const GOALS = [
  { id: 'g1', name: 'Flight training', main: true, hasHours: true },
  { id: 'g2', name: 'Emergency fund', main: false, hasHours: false },
]

function inputFor(facts: readonly Fact[], over: Partial<ModelPayloadInput> = {}): ModelPayloadInput {
  const line = dayLine({ facts, tone: 'cheerleader' })
  return {
    tone: 'cheerleader',
    line: line === null ? null : factOf(line.factKey),
    cards: rankCards({ facts, dismissed: new Set() }).cards,
    goals: GOALS,
    quotes: LIBRARY.slice(0, 6),
    shareShopNames: true,
    ...over,
  }
}

/** Every key and every leaf value in a JSON value. */
function walk(value: unknown, keys: string[] = [], leaves: unknown[] = []): { keys: string[]; leaves: unknown[] } {
  if (Array.isArray(value)) value.forEach((v) => walk(v, keys, leaves))
  else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      keys.push(k)
      walk(v, keys, leaves)
    }
  } else leaves.push(value)
  return { keys, leaves }
}

describe('modelPayload', () => {
  it('has no field an amount, a balance or a date could be sent in', () => {
    expectTypeOf<CarriesNumber<NarrateDaily>>().toEqualTypeOf<false>()
    // The check itself catches a number, however deep.
    expectTypeOf<CarriesNumber<{ a: readonly { b: number | null }[] }>>().toEqualTypeOf<true>()
    const { brief } = modelPayload(inputFor(FACTS))
    const { keys, leaves } = walk(brief)
    expect(leaves.filter((v) => typeof v === 'number' || typeof v === 'bigint')).toEqual([])
    expect(keys.filter((k) => /amount|balance|cents|date|value|figure|actual|budget/i.test(k))).toEqual([])
  })

  it('letters the day’s line first, then the cards in rank order, then the goals, main first', () => {
    const input = inputFor(FACTS)
    const { brief, keys } = modelPayload(input)
    expect(brief.summary).toBe('A')
    expect(brief.cards).toEqual(['B', 'C', 'D'])
    expect(brief.facts.map((f) => f.id)).toEqual(['A', 'B', 'C', 'D'])
    expect(keys).toEqual({
      A: 'summary:month',
      ...Object.fromEntries(input.cards.map((c, i) => [letterOf(i + 1), c.fact.key])),
      E: 'goal:g1',
      F: 'goal:g2',
    })
    expect(brief.goals).toEqual([
      { id: 'E', about: 'Flight training', main: true, unit: 'hours' },
      { id: 'F', about: 'Emergency fund', main: false, unit: 'dollars' },
    ])
    expect(brief.facts[0]).toEqual({
      id: 'A', kind: 'month_so_far', about: 'This month', direction: 'up', size: 'slight', evidence: 'thin', meaning: 'watch',
      slots: ['name', 'now', 'before', 'change', 'now_to', 'before_to'],
    })
    expect(brief.quotes.map((q) => Object.keys(q))).toEqual(LIBRARY.slice(0, 6).map(() => ['id', 'kind', 'text', 'by']))
  })

  it('starts the cards at A when there is no line', () => {
    const { brief } = modelPayload(inputFor(FACTS, { line: null, goals: [] }))
    expect(brief.summary).toBeNull()
    expect(brief.cards).toEqual(['A', 'B', 'C'])
    expect(letterOf(25)).toBe('Z')
    expect(letterOf(26)).toBe('AA')
    expect(letterOf(51)).toBe('AZ')
  })

  it('masks a store number in a name, and cuts a long name to 40 characters', () => {
    expect(maskLabel('SHELL C12345 TORONTO ON')).toBe('SHELL C# TORONTO ON')
    expect(maskLabel('7-ELEVEN 123 Main')).toBe('7-ELEVEN 123 Main')
    expect(maskLabel('Card ４５６７８９ ending')).toBe('Card # ending')
    expect(maskLabel('x'.repeat(45))).toBe('x'.repeat(40))
    const named = { ...factOf('cat:dining:change'), subject: { type: 'category' as const, id: 'dining', label: 'PIZZA PLACE #04417 LONDON ONTARIO CANADA N6A' } }
    const { brief } = modelPayload(inputFor(FACTS, { line: null, cards: [{ fact: named, template: 'change_up', action: 'see_month' }] }))
    expect(brief.facts[0]?.about).toBe('PIZZA PLACE ## LONDON ONTARIO CANADA N6A')
  })

  it('says "a shop" for a shop when Share shop names is off, and still names a category', () => {
    const cards = [
      { fact: factOf('shop:SPOTIFY:price_rise'), template: 'price_rise' as const, action: 'shops' as const },
      { fact: factOf('cat:dining:change'), template: 'change_up' as const, action: 'see_month' as const },
    ]
    const about = (shareShopNames: boolean) => modelPayload(inputFor(FACTS, { line: null, cards, shareShopNames })).brief.facts.map((f) => f.about)
    expect(about(true)).toEqual(['SPOTIFY', 'Dining out'])
    expect(about(false)).toEqual(['a shop', 'Dining out'])
  })
})

describe('the signatures', () => {
  it('stay the same when a cent changes, and change when a claim does', () => {
    const base = canonicalPayload(modelPayload(inputFor(FACTS)).brief)
    // A dollar more at Dining out: the same claims, so the same signature.
    const nudged = factsDigest({ ...EVERY_KIND, entries: EVERY_KIND.entries.map((e) => (e.amountCents === -60_000 ? { ...e, amountCents: -60_100 } : e)) }).facts
    expect(nudged.find((f) => f.key === 'cat:dining:change')?.figures).not.toEqual(factOf('cat:dining:change').figures)
    expect(canonicalPayload(modelPayload(inputFor(nudged)).brief)).toBe(base)
    expect(canonicalPayload(modelPayload(inputFor(FACTS, { tone: 'straight' })).brief)).not.toBe(base)
    expect(canonicalPayload(modelPayload(inputFor(FACTS, { goals: GOALS.slice(0, 1) })).brief)).not.toBe(base)
  })

  it('sign one card by its claims and tone, never its figures', () => {
    const fact = factOf('cat:dining:change')
    const sig = cardSignature({ fact, template: 'change_up', tone: 'cheerleader' })
    expect(sig).not.toMatch(/\d{3,}/)
    expect(cardSignature({ fact: { ...fact, figures: {} }, template: 'change_up', tone: 'cheerleader' })).toBe(sig)
    for (const changed of [{ ...fact, size: 'clear' as const }, { ...fact, evidence: 'thin' as const }, { ...fact, direction: 'down' as const }]) {
      expect(cardSignature({ fact: changed, template: 'change_up', tone: 'cheerleader' })).not.toBe(sig)
    }
    expect(cardSignature({ fact, template: 'change_up', tone: 'straight' })).not.toBe(sig)
    expect(goalLineSignature(GOALS, 'cheerleader')).not.toBe(goalLineSignature([...GOALS].reverse(), 'cheerleader'))
  })
})
