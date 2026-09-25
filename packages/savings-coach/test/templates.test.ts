import { describe, expect, it } from 'vitest'
import {
  GOAL_LINE_TEMPLATES,
  LINE_TEMPLATES,
  PLAIN_TEMPLATES,
  TONES,
  WATCH_TEMPLATES,
  cardTemplateKey,
  cardWords,
  renderSegments,
  slotsOf,
  type CardTemplateKey,
} from '../src/index.js'
import type { Fact } from '@budget/core'
import { proseProblem } from '@budget/schema'
import { FACTS, TREND_FACTS, WIN_FACTS, factOf, forecastOf } from './fixtures.js'

/**
 * ADR 0005 §4's rules 1 to 7, as ModelProse applies them to a model's
 * words: the app's own words must pass the very rule a model's must, so
 * the two are drawn by the same code and neither can hold a figure.
 */
const breaksTextRule = (text: string, limit: number) => proseProblem(text, limit)

/** A fact of each card template's kind, from the fixture, so the slots are the engine's. */
const SAMPLE: Readonly<Record<CardTemplateKey, () => Fact>> = {
  stale_data: () => factOf('data:stale'),
  rows_waiting: () => factOf('review:waiting'),
  change_up: () => factOf('cat:dining:change'),
  change_down: () => factOf('cat:groceries:change'),
  trend_up: () => factOf('cat:dining:trend'),
  trend_down: () => factOf('cat:groceries:trend'),
  over_budget: () => factOf('cat:fuel:over_budget'),
  near_budget: () => factOf('cat:fun:near_budget'),
  budget_pace: () => factOf('cat:fun:pace'),
  saved_more: () => factOf('summary:saved'),
  goal_milestone: () => factOf('goal:g1:milestone'),
  forecast: () => forecastOf(500_000),
  forecast_spent: () => forecastOf(null),
  forecast_watch: () => forecastOf(50_000),
}

const CARDS = { ...WATCH_TEMPLATES, ...PLAIN_TEMPLATES }

describe('the app’s own templates', () => {
  it('pass the text rule in every tone', () => {
    for (const [key, tones] of Object.entries(CARDS)) {
      for (const tone of TONES) {
        const t = tones[tone]
        const parts: [string, string, number][] = [['title', t.title, 80], ['body', t.body, 240]]
        if ('tryThis' in t) parts.push(['tryThis', t.tryThis, 240])
        for (const [part, text, limit] of parts) expect(breaksTextRule(text, limit), `${key} ${tone} ${part}`).toBeNull()
      }
    }
    for (const [key, tones] of Object.entries(LINE_TEMPLATES)) {
      for (const tone of TONES) expect(breaksTextRule(tones[tone], 200), `${key} ${tone}`).toBeNull()
    }
    for (const tone of TONES) {
      expect(breaksTextRule(GOAL_LINE_TEMPLATES[tone], 160), `goal line ${tone}`).toBeNull()
      // The goal line names the main goal and nothing else: the card beside it shows the figures.
      expect(renderSegments({ text: GOAL_LINE_TEMPLATES[tone], slots: { A: ['name'] } }).ok, `goal line ${tone}`).toBe(true)
    }
  })

  it('name only the slots their kind of fact has', () => {
    for (const [key, sample] of Object.entries(SAMPLE) as [CardTemplateKey, () => Fact][]) {
      const fact = sample()
      expect(cardTemplateKey(fact)).toBe(key)
      for (const tone of TONES) {
        const t = CARDS[key][tone]
        for (const text of [t.title, t.body, 'tryThis' in t ? t.tryThis : '']) {
          expect(renderSegments({ text, slots: { A: slotsOf(fact) } }).ok, `${key} ${tone}: ${text}`).toBe(true)
        }
      }
    }
    for (const kind of ['month', 'week']) {
      const summary = factOf(`summary:${kind}`)
      for (const [key, tones] of Object.entries(LINE_TEMPLATES).filter(([k]) => k.startsWith(kind))) {
        for (const tone of TONES) expect(renderSegments({ text: tones[tone], slots: { A: slotsOf(summary) } }).ok, key).toBe(true)
      }
    }
  })

  it('never make a category’s name the subject of a singular verb, since it may be plural', () => {
    // "Groceries is running ahead" reads wrong; "Running ahead: Groceries" does not (N71).
    const texts = Object.values(CARDS).flatMap((tones) => TONES.flatMap((tone) => Object.values(tones[tone]) as string[]))
    for (const text of texts) expect(text, text).not.toMatch(/\{\{A\.name\}\} (is|was|has|ends|goes)\b/)
  })

  it('give every card that asks to watch something one thing to try', () => {
    for (const tones of Object.values(WATCH_TEMPLATES)) {
      for (const tone of TONES) expect(tones[tone].tryThis).toMatch(/^(One thing to try|Try this): \S/)
    }
    expect(cardWords('near_budget', 'straight')).toEqual(WATCH_TEMPLATES.near_budget.straight)
    expect(cardWords('change_down', 'cheerleader')).toEqual({ ...PLAIN_TEMPLATES.change_down.cheerleader, tryThis: null })
  })

  it('have a card template for every kind but the summaries, which are the day’s line', () => {
    const kinds = new Set([...FACTS, ...WIN_FACTS, ...TREND_FACTS].map((f) => f.kind))
    expect(kinds.size).toBe(11)
    for (const fact of [...FACTS, ...WIN_FACTS, ...TREND_FACTS]) {
      const summary = fact.kind === 'month_so_far' || fact.kind === 'week_so_far'
      expect(cardTemplateKey(fact) === null, fact.key).toBe(summary)
    }
  })

  it('catch what the rule is for', () => {
    expect(breaksTextRule('Up {{A.change}} from $40', 240)).toBe('number')
    expect(breaksTextRule('Up by forty dollars', 240)).toBe('number_word')
    expect(breaksTextRule('<img src=x onerror=y>', 240)).toBe('markup')
    expect(breaksTextRule('One thing to try: save more money often', 240)).toBeNull()
    expect(breaksTextRule('Put it in an index fund', 240)).toBe('product')
    expect(breaksTextRule('{{A.change', 240)).toBe('stray_brace')
  })
})
