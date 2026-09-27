import { describe, expect, it } from 'vitest'
import type { CategoriseBrief } from '@budget/schema'
import { clearCandidateSuggestion, listPending } from '../src/ledger.js'
import { suggestCategories, suggestionsReady } from '../src/review/suggestions.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/** Shop names are invented. */
function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      { id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
      { id: 'c2', name: 'Coffee', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
      { id: 'c9', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
    ],
    ingest_candidates: [
      { id: 'p1', posted_on: '2026-09-09', amount_cents: -6412, merchant: 'CORNER MARKET', merchant_raw: 'CORNER MARKET #12', status: 'pending' },
      { id: 'p2', posted_on: '2026-09-10', amount_cents: -450, merchant: 'LITWARE COFFEE', merchant_raw: 'SQ *LITWARE COFFEE', status: 'pending' },
      { id: 'p3', posted_on: '2026-09-11', amount_cents: -525, merchant: 'LITWARE COFFEE', merchant_raw: 'SQ *LITWARE COFFEE', status: 'pending' },
    ],
  })
}

/** A helper that files every row under the category named `name`, at this confidence. */
function answering(fake: FakeSupabase, name: string, confidence = 'high') {
  fake.functions.ai = (body) => {
    const brief = body['data'] as CategoriseBrief
    const alias = brief.categories.find((c) => c.name === name)?.alias ?? 'c99'
    const text = JSON.stringify({ suggestions: brief.rows.map((r) => ({ i: r.i, alias, confidence })) })
    return new Response(JSON.stringify({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text }), { headers: { 'content-type': 'application/json' } })
  }
}

async function input(fake: FakeSupabase) {
  const { rows } = await listPending(fake.client)
  return {
    rows: rows.map((r) => ({ id: r.id, merchant: r.merchant, amountCents: r.amount_cents, categoryId: r.category_id })),
    categories: fake.tables.categories,
    learned: new Set<string>(),
  }
}

const stored = (fake: FakeSupabase) => fake.tables.ingest_candidates.map((r) => [r.id, r.category_id ?? null, r.category_source ?? null])

describe('suggesting categories for Review', () => {
  it('stores what the AI picked as the model’s, one ask for a shop seen twice', async () => {
    const fake = seeded()
    answering(fake, 'Groceries')
    expect(await suggestCategories(fake.client, await input(fake))).toEqual({ suggested: 3, stopped: null })
    expect(stored(fake)).toEqual([['p1', 'c1', 'model'], ['p2', 'c1', 'model'], ['p3', 'c1', 'model']])
    expect(fake.functions.calls).toHaveLength(1)
    const sent = fake.functions.calls[0]!['data'] as CategoriseBrief
    expect(sent.rows.map((r) => r.shop)).toEqual(['CORNER MARKET', 'LITWARE COFFEE'])
    expect(JSON.stringify(sent)).not.toMatch(/6412|412|2026|Card payments/)
    // Read back, a suggestion comes with its source, for the screen to label it.
    expect((await listPending(fake.client)).rows[0]).toMatchObject({ category_id: 'c1', category_source: 'model' })
  })

  it('stores a pick for a shop seen more than 200 times in parts 0018 takes', async () => {
    const fake = seeded()
    fake.tables.ingest_candidates.push(
      ...Array.from({ length: 250 }, (_, n) => ({ id: `r${n}`, posted_on: '2026-09-12', amount_cents: -475, merchant: 'LITWARE COFFEE', merchant_raw: 'SQ *LITWARE COFFEE', status: 'pending' })),
    )
    answering(fake, 'Coffee')
    expect(await suggestCategories(fake.client, await input(fake))).toEqual({ suggested: 253, stopped: null })
    expect(fake.functions.calls).toHaveLength(1)
    const sizes = fake.rpcCalls.filter((c) => c.name === 'suggest_candidate_categories').map((c) => (c.args['p'] as unknown[]).length)
    expect(sizes).toEqual([200, 53])
  })

  it('stores nothing the AI was unsure of', async () => {
    const fake = seeded()
    answering(fake, 'Groceries', 'low')
    expect(await suggestCategories(fake.client, await input(fake))).toEqual({ suggested: 0, stopped: null })
    expect(stored(fake).every(([, category]) => category === null)).toBe(true)
  })

  it('says why it stopped: no helper, or 0018 not pasted', async () => {
    const fake = seeded()
    fake.functions.ai = null
    const none = await suggestCategories(fake.client, await input(fake))
    expect(none).toEqual({ suggested: 0, stopped: { kind: 'ai', view: expect.objectContaining({ state: 'not_deployed' }) } })

    const old = seeded()
    answering(old, 'Coffee')
    delete old.rpcReplies['suggest_candidate_categories']
    expect(await suggestCategories(old.client, await input(old))).toEqual({ suggested: 0, stopped: { kind: 'needs_update' } })
    expect(stored(old).every(([, category]) => category === null)).toBe(true)
  })

  it('knows whether 0018 is in without changing anything', async () => {
    const fake = seeded()
    expect(await suggestionsReady(fake.client)).toBe('in')
    expect(fake.rpcCalls).toEqual([{ name: 'suggest_candidate_categories', args: { p: [] } }])
    fake.fail('rpc/suggest_candidate_categories', '57014')
    expect(await suggestionsReady(fake.client)).toBe('unknown')
    delete fake.rpcReplies['suggest_candidate_categories']
    fake.heal('rpc/suggest_candidate_categories')
    expect(await suggestionsReady(fake.client)).toBe('missing')
  })

  it('clears a suggestion, and only a suggestion', async () => {
    const fake = seeded()
    answering(fake, 'Coffee')
    await suggestCategories(fake.client, await input(fake))
    expect(await clearCandidateSuggestion(fake.client, 'p2')).toBe(true)
    expect(await clearCandidateSuggestion(fake.client, 'p2')).toBe(false)
    expect(stored(fake)).toEqual([['p1', 'c2', 'model'], ['p2', null, null], ['p3', 'c2', 'model']])
  })
})
