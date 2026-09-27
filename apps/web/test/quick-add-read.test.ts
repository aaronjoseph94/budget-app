import { describe, expect, it } from 'vitest'
import type { QuickAddBrief } from '@budget/schema'
import { readQuickEntry } from '../src/add/quick-add.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/** Just type it's reading, before any screen (plan A22). Shop names are invented. */
const CATEGORIES: readonly Category[] = [
  { id: 'c-coffee', name: 'Coffee', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
  { id: 'c-moved', name: 'Moved to savings', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
]
const RULES = new Map([['LITWARE COFFEE', 'c-coffee']])
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** A helper that answers every line with `reply`, keeping each brief. */
function answering(reply: Record<string, unknown>): { fake: FakeSupabase; briefs: QuickAddBrief[] } {
  const fake = createFakeSupabase()
  const briefs: QuickAddBrief[] = []
  fake.functions.ai = (body) => {
    briefs.push(body['data'] as QuickAddBrief)
    return json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify(reply) })
  }
  return { fake, briefs }
}

const read = (fake: FakeSupabase, text: string) => readQuickEntry(fake.client, { text, asOf: '2026-09-27', rules: RULES, categories: CATEGORIES })

describe('readQuickEntry', () => {
  it('asks nothing when the parser filled every field', async () => {
    const { fake, briefs } = answering({})
    const r = await read(fake, 'Litware Coffee 5.25 yesterday')
    expect(r).toEqual({
      fill: { amount: '5.25', date: '2026-09-26', flow: 'spent', shop: 'Litware Coffee', categoryId: 'c-coffee', byAi: new Set() },
      help: { kind: 'not_needed' },
    })
    expect(briefs).toEqual([])
  })

  it('asks only about the empty fields, never offers Not spending, and takes the AI’s amount out of the shop', async () => {
    const { fake, briefs } = answering({ amount: '$12', category: 'c1', date: null, shop: null, flow: null })
    const r = await read(fake, '3 coffees 12 4')
    expect(briefs).toEqual([{ text: '3 coffees 12 4', today: '2026-09-27', missing: ['amount', 'category', 'flow'], categories: [{ alias: 'c1', name: 'Coffee', list: 'variable' }] }])
    expect(r.fill).toMatchObject({ amount: '12.00', shop: '3 coffees 4', categoryId: 'c-coffee', byAi: new Set(['amount', 'category']) })
    expect(r.help).toEqual({ kind: 'asked', filled: 2 })
  })

  it('drops an amount that is not the owner’s words, and a reply that is not one', async () => {
    const wrong = answering({ amount: '15', category: null, date: null, shop: null, flow: null })
    expect(await read(wrong.fake, '3 coffees 12')).toMatchObject({ fill: { amount: '', shop: '3 coffees 12', byAi: new Set() }, help: { kind: 'asked', filled: 0 } })
    const garbled = createFakeSupabase()
    garbled.functions.ai = () => json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: 'not json' })
    expect((await read(garbled, '3 coffees 12')).help).toEqual({ kind: 'unreadable' })
  })

  it('keeps what the parser read when the helper is not installed', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = null
    const r = await read(fake, 'lunch 14 last friday')
    expect(r.fill).toMatchObject({ amount: '14.00', date: '2026-09-25', shop: 'lunch', categoryId: '' })
    expect(r.help).toMatchObject({ kind: 'stopped', view: { state: 'not_deployed' } })
  })
})
