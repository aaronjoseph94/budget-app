import { describe, expect, expectTypeOf, it } from 'vitest'
import { AI_HELPER_VERSION, AI_KEY_SHAPE, AI_MODELS, AiProviderSchema, CATEGORY_ALIAS, type AiRequest, type NarrateDaily } from '@budget/schema'
import { MODELS, RequestSchema, VERSION } from '../ai/index.js'

/** Readonly all the way down: the app's types are, and zod's output is not, which is no difference on the wire. */
type Frozen<T> = T extends readonly (infer U)[] ? readonly Frozen<U>[] : T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T

/** A brief as the app builds one, cut to one fact. */
const FACT = { id: 'A', kind: 'month_so_far', about: 'This month', direction: 'down', size: 'clear', evidence: 'thin', meaning: 'good', slots: ['change'] } as const
const BRIEF: NarrateDaily = { tone: 'cheerleader', facts: [FACT], summary: 'A', cards: [], goals: [], quotes: [] }

/**
 * The helper parses its requests with its own zod, since it is pasted as
 * one file; the app sends packages/schema's AiRequest. tsc holds the two
 * types equal, and each request the app can send is taken here.
 */
describe('the helper and the app agree on what may be asked', () => {
  it('takes exactly the requests packages/schema names', () => {
    expectTypeOf<Frozen<ReturnType<typeof RequestSchema.parse>>>().toEqualTypeOf<Frozen<AiRequest>>()
    const sent: readonly AiRequest[] = [
      { action: 'ping' },
      { action: 'status' },
      { action: 'save_key', provider: 'gemini', key: 'test-not-a-real-key-0001' },
      { action: 'test_key', provider: 'gemini' },
      { action: 'run', task: 'test' },
      { action: 'run', task: 'narrate', pack: 'daily', data: BRIEF },
      { action: 'run', task: 'narrate', pack: 'report', data: { tone: 'straight', facts: [FACT], points: ['A'], tryThis: null } },
      { action: 'run', task: 'narrate', pack: 'checkin', data: { tone: 'straight', facts: [FACT], recap: 'A', win: null, tryThis: null, goals: [] } },
      { action: 'run', task: 'categorise', data: { rows: [{ i: 1, shop: 'CORNER MARKET', flow: 'spent', size: 'small' }], categories: [{ alias: 'c1', name: 'Groceries', list: 'variable' }] } },
      { action: 'run', task: 'quick_add', data: { text: '3 coffees 12', today: '2026-09-27', missing: ['amount'], categories: [{ alias: 'c1', name: 'Coffee', list: 'variable' }] } },
      { action: 'run', task: 'receipt', data: { image: 'QUJD'.repeat(40), mimeType: 'image/jpeg' } },
      { action: 'run', task: 'ask', data: { question: 'coffee in August?', today: '2026-09-27', categories: [{ alias: 'c1', name: 'Coffee', list: 'variable' }], topics: [{ id: 'month-end', title: 'Two month-end figures' }] } },
    ]
    for (const provider of AiProviderSchema.options) {
      expect(RequestSchema.safeParse({ action: 'save_key', provider, key: 'test-not-a-real-key-0001' }).success).toBe(true)
      expect(RequestSchema.safeParse({ action: 'test_key', provider }).success).toBe(true)
    }
    for (const body of sent) expect(RequestSchema.safeParse(body).success).toBe(true)
    expect(RequestSchema.options.map((o) => o.shape.action.value)).toEqual(sent.map((b) => b.action))
    // A brief with anything more than the app sends, or a figure where a word goes, is refused.
    for (const data of [{ ...BRIEF, amount: 41200 }, { ...BRIEF, facts: [{ ...BRIEF.facts[0], value: 5 }] }, { ...BRIEF, summary: 'A1' }]) {
      expect(RequestSchema.safeParse({ action: 'run', task: 'narrate', pack: 'daily', data }).success).toBe(false)
    }
  })

  it('takes a key of exactly the shape the app checks before sending', () => {
    for (const key of ['test-not-a-real-key-0001', 'a'.repeat(20), 'a'.repeat(200), 'x'.repeat(19), 'a'.repeat(201), 'test not a real key 0001', 'test-not-a-real-key-000/']) {
      const helper = RequestSchema.safeParse({ action: 'save_key', provider: 'gemini', key }).success
      expect([key, helper]).toEqual([key, AI_KEY_SHAPE.test(key)])
    }
  })

  it('takes a category alias of exactly the shape the app writes', () => {
    for (const alias of ['c1', 'c10', 'c200', 'c0', 'c01', 'c201', 'C1', 'Groceries']) {
      const data = { rows: [{ i: 1, shop: 'CORNER MARKET', flow: 'spent', size: 'small' }], categories: [{ alias, name: 'Groceries', list: 'variable' }] }
      const helper = RequestSchema.safeParse({ action: 'run', task: 'categorise', data }).success
      expect([alias, helper]).toEqual([alias, CATEGORY_ALIAS.test(alias)])
    }
  })

  it('is the version the app expects, so One-time updates can tell an older copy', () => {
    expect(VERSION).toBe(AI_HELPER_VERSION)
  })

  it('knows the same services as the database', () => {
    expect(AiProviderSchema.options).toEqual(['gemini', 'groq', 'openrouter', 'openai', 'anthropic'])
  })

  it('names the same models, and which read a photo, as the app does', () => {
    expect(MODELS).toEqual(AI_MODELS)
    for (const provider of AiProviderSchema.options) expect(AI_MODELS[provider].length).toBeGreaterThan(0)
  })
})
