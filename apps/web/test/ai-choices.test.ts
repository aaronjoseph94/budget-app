import { describe, expect, it } from 'vitest'
import { DEFAULT_CHOICES, moved, orderOf, readChoices, saveChoices } from '../src/ai/choices.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * The owner's AI choices in ai_settings (plan §8.3, A11): the order the
 * services are tried in, read the way the helper reads it, paid services,
 * and the daily limit, with 0016's defaults when nothing is saved.
 */

describe('the order', () => {
  it('reads a stored order as the helper does: its services once each, then the rest', () => {
    expect(orderOf(['openrouter', 'gemini', 'openrouter', 'made-up', 3])).toEqual(['openrouter', 'gemini', 'groq', 'openai', 'anthropic'])
    expect(orderOf(null)).toEqual(['gemini', 'groq', 'openrouter', 'openai', 'anthropic'])
  })

  it('moves one service a place, and nothing past either end', () => {
    const order = orderOf([])
    expect(moved(order, 'groq', -1)).toEqual(['groq', 'gemini', 'openrouter', 'openai', 'anthropic'])
    expect(moved(order, 'openai', 1)).toEqual(['gemini', 'groq', 'openrouter', 'anthropic', 'openai'])
    expect(moved(order, 'gemini', -1)).toBe(order)
    expect(moved(order, 'anthropic', 1)).toBe(order)
  })
})

describe('reading and saving', () => {
  it('gives 0016’s defaults when nothing is saved: free Gemini first, paid off, 40 a day', async () => {
    expect(await readChoices(createFakeSupabase().client, 'u1')).toEqual({ ok: true, choices: DEFAULT_CHOICES })
    expect(DEFAULT_CHOICES).toEqual({ order: ['gemini', 'groq', 'openrouter', 'openai', 'anthropic'], allowPaid: false, dailyCap: 40 })
  })

  it('reads the owner’s own row, and saves all three in one write, keeping the model choices', async () => {
    const fake = createFakeSupabase({ ai_settings: [{ user_id: 'u1', models: { gemini: 'gemini-3.5-flash' }, provider_order: ['groq'], allow_paid: true, daily_cap: 60 }] })
    const read = await readChoices(fake.client, 'u1')
    expect(read).toEqual({ ok: true, choices: { order: ['groq', 'gemini', 'openrouter', 'openai', 'anthropic'], allowPaid: true, dailyCap: 60 } })
    expect(await saveChoices(fake.client, 'u1', { order: ['anthropic', 'gemini'], allowPaid: false, dailyCap: 10 })).toBe(true)
    expect(fake.tables.ai_settings).toEqual([
      { user_id: 'u1', models: { gemini: 'gemini-3.5-flash' }, provider_order: ['anthropic', 'gemini'], allow_paid: false, daily_cap: 10 },
    ])
  })

  it('tells a missing one-time update from a lost connection', async () => {
    for (const [code, why] of [['42P01', 'needs_update'], ['PGRST205', 'needs_update'], ['08006', 'unreachable']] as const) {
      const fake = createFakeSupabase()
      fake.fail('ai_settings', code)
      expect(await readChoices(fake.client, 'u1')).toEqual({ ok: false, why })
      expect(await saveChoices(fake.client, 'u1', DEFAULT_CHOICES)).toBe(why)
    }
  })
})
