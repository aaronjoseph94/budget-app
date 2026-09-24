import { describe, expect, it } from 'vitest'
import {
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
import { FACTS, factOf } from './fixtures.js'

/**
 * ADR 0005 §4's rules 1 to 7, checked here by the test itself until
 * ModelProse arrives in packages/schema (plan A12): the app's own words must
 * pass the rule a model's words will.
 */
const NUMBER_WORDS = [
  'zero', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty',
  'sixty', 'seventy', 'eighty', 'ninety', 'hundreds?', 'thousands?', 'millions?', 'billions?', 'trillions?',
  'half', 'halves', 'halve', 'halved', 'quarters?', 'thirds?', 'double', 'doubled', 'twice', 'triple', 'tripled',
  'dozens?', 'percent', 'percentage', 'pct',
]
const PRODUCTS = ['crypto', 'bitcoin', 'stocks?', 'etf', 'index fund', 'mutual fund', 'tfsa', 'rrsp', 'gic', 'invest in']
const BLANK = /\{\{[A-Z]{1,2}\.[a-z_]{1,24}\}\}/g

function breaksTextRule(raw: string, limit: number): string | null {
  const text = raw.normalize('NFKC')
  const bare = text.replace(BLANK, '')
  if (/[{}]/.test(bare)) return 'a stray brace'
  if (/[\p{N}\p{Sc}]/u.test(bare)) return 'a number or currency sign'
  if (/[%‰#@<>`*_[\]|\\~]/.test(bare)) return 'a markup or percent character'
  if (/http|www\.|:\/\//i.test(bare)) return 'a link'
  const word = (list: readonly string[]) => new RegExp(`(?<![\\p{L}])(${list.join('|')})(?![\\p{L}])`, 'iu')
  if (word(NUMBER_WORDS).test(bare)) return 'a number word'
  if (word(PRODUCTS).test(bare)) return 'advice on a product'
  if ((text.match(/\n/g) ?? []).length > 2) return 'more than two line breaks'
  if (text.length > limit) return `more than ${limit} characters`
  return null
}

/** A fact of each card template's kind, from the fixture, so the slots are the engine's. */
const SAMPLE: Readonly<Record<CardTemplateKey, string>> = {
  stale_data: 'data:stale',
  rows_waiting: 'review:waiting',
  change_up: 'cat:dining:change',
  change_down: 'cat:groceries:change',
  over_budget: 'cat:fuel:over_budget',
  near_budget: 'cat:fun:near_budget',
  budget_pace: 'cat:fun:pace',
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
  })

  it('name only the slots their kind of fact has', () => {
    for (const [key, factKey] of Object.entries(SAMPLE) as [CardTemplateKey, string][]) {
      const fact = factOf(factKey)
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

  it('give every card that asks to watch something one thing to try', () => {
    for (const tones of Object.values(WATCH_TEMPLATES)) {
      for (const tone of TONES) expect(tones[tone].tryThis).toMatch(/^(One thing to try|Try this): \S/)
    }
    expect(cardWords('near_budget', 'straight')).toEqual(WATCH_TEMPLATES.near_budget.straight)
    expect(cardWords('change_down', 'cheerleader')).toEqual({ ...PLAIN_TEMPLATES.change_down.cheerleader, tryThis: null })
  })

  it('have a card template for every kind but the summaries, which are the day’s line', () => {
    const kinds = new Set(FACTS.map((f) => f.kind))
    expect(kinds.size).toBe(8)
    for (const fact of FACTS) {
      const summary = fact.kind === 'month_so_far' || fact.kind === 'week_so_far'
      expect(cardTemplateKey(fact) === null, fact.key).toBe(summary)
    }
  })

  it('catch what the rule is for', () => {
    expect(breaksTextRule('Up {{A.change}} from $40', 240)).toBe('a number or currency sign')
    expect(breaksTextRule('Up by forty dollars', 240)).toBe('a number word')
    expect(breaksTextRule('<img src=x onerror=y>', 240)).toBe('a markup or percent character')
    expect(breaksTextRule('One thing to try: save more money often', 240)).toBeNull()
    expect(breaksTextRule('Put it in an index fund', 240)).toBe('advice on a product')
    expect(breaksTextRule('{{A.change', 240)).toBe('a stray brace')
  })
})
