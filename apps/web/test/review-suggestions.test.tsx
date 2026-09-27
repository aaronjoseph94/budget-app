import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CategoriseBrief } from '@budget/schema'
import { ReviewScreen } from '../src/screens/ReviewScreen.js'
import { aiStatusReply, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/** Review's suggested categories (plan A21). Shop names are invented. */
function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      { id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
      { id: 'c2', name: 'Coffee', kind: 'variable', sort_order: 1, weekly_budget_cents: null },
    ],
    ingest_candidates: [
      // The AI's suggestion, as 0018 stores it.
      { id: 'p1', posted_on: '2026-09-09', amount_cents: -6412, merchant: 'CORNER MARKET', merchant_raw: 'CORNER MARKET #12', category_id: 'c1', category_source: 'model', status: 'pending' },
      { id: 'p2', posted_on: '2026-09-10', amount_cents: -450, merchant: 'LITWARE COFFEE', merchant_raw: 'SQ *LITWARE COFFEE', status: 'pending' },
    ],
  })
}

/** The same queue with nothing suggested yet. */
function fresh(): FakeSupabase {
  const fake = seeded()
  fake.tables.ingest_candidates[0] = { ...fake.tables.ingest_candidates[0]!, category_id: null, category_source: null }
  return fake
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** AI on through the receipts key, and a helper that files each shop as `files` says. */
function aiOn(fake: FakeSupabase, files: Readonly<Record<string, string>> = { 'CORNER MARKET': 'Groceries', 'LITWARE COFFEE': 'Coffee' }) {
  const [gemini, ...rest] = fake.functions.aiStatus.services
  fake.functions.aiStatus = aiStatusReply({ services: [{ ...gemini!, source: 'secret', hint: 'abcd' }, ...rest] })
  fake.functions.ai = (body) => {
    if (body['action'] !== 'run') return json(fake.functions.aiStatus)
    const brief = body['data'] as CategoriseBrief
    const suggestions = brief.rows.flatMap((r) => {
      const alias = brief.categories.find((c) => c.name === files[r.shop])?.alias
      return alias === undefined ? [] : [{ i: r.i, alias, confidence: 'high' }]
    })
    return json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify({ suggestions }) })
  }
}

const runs = (fake: FakeSupabase) => fake.functions.calls.filter((c) => c['action'] === 'run')

async function row(merchantRaw: string) {
  const item = (await screen.findByText(merchantRaw)).closest('li')
  if (!(item instanceof HTMLElement)) throw new Error(`no row for ${merchantRaw}`)
  return within(item)
}

const picker = async (merchantRaw: string) => (await row(merchantRaw)).getByRole<HTMLSelectElement>('combobox', { name: 'Category' })

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('Review shows suggested categories', () => {
  it('shows the AI’s suggestion picked and labelled, and approves nothing by itself', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    expect((await row('CORNER MARKET #12')).getByText('✨ Suggested: Groceries')).toBeTruthy()
    expect((await picker('CORNER MARKET #12')).value).toBe('c1')
    expect((await picker('SQ *LITWARE COFFEE')).value).toBe('')
    expect(fake.rpcCalls.map((c) => c.name)).not.toContain('approve_candidate')
  })

  it('approves a suggestion as the owner’s pick, and sends another category when the owner changes it', async () => {
    const fake = seeded()
    fake.tables.ingest_candidates[1] = { ...fake.tables.ingest_candidates[1]!, category_id: 'c2', category_source: 'model' }
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: /Approve/ }))
    await screen.findByText(/^Added\./)
    fireEvent.change(await picker('SQ *LITWARE COFFEE'), { target: { value: 'c1' } })
    expect((await row('SQ *LITWARE COFFEE')).queryByText(/Suggested:/)).toBeNull()
    fireEvent.click((await row('SQ *LITWARE COFFEE')).getByRole('button', { name: /Approve/ }))
    await waitFor(() => expect(fake.rpcCalls.filter((c) => c.name === 'approve_candidate')).toHaveLength(2))
    expect(fake.rpcCalls.filter((c) => c.name === 'approve_candidate').map((c) => c.args)).toEqual([
      { p_candidate: 'p1', p_category: 'c1' },
      { p_candidate: 'p2', p_category: 'c1' },
    ])
  })

  it('puts a suggestion back with Not this', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: 'Not this' }))
    await waitFor(async () => expect((await picker('CORNER MARKET #12')).value).toBe(''))
    expect(fake.rpcCalls).toEqual([{ name: 'clear_candidate_suggestion', args: { p_candidate: 'p1' } }])
    expect((await row('CORNER MARKET #12')).queryByText(/Suggested:/)).toBeNull()
    expect(fake.tables.ingest_candidates[0]).toMatchObject({ category_id: null, category_source: null })
  })

  it('prefers a rule the owner taught over the AI’s suggestion', async () => {
    const fake = seeded()
    fake.tables.merchant_rules.push({ match_merchant: 'CORNER MARKET', category_id: 'c2' })
    renderScreen(<ReviewScreen />, fake)

    expect((await row('CORNER MARKET #12')).getByText('How you filed this merchant last time.')).toBeTruthy()
    expect((await picker('CORNER MARKET #12')).value).toBe('c2')
  })

  it('picks a similar shop’s category without storing it', async () => {
    const fake = seeded()
    fake.tables.merchant_rules.push({ match_merchant: 'LITWARE COFFEE ROASTERS', category_id: 'c2' })
    renderScreen(<ReviewScreen />, fake)

    expect((await row('SQ *LITWARE COFFEE')).getByText('You filed a similar shop under Coffee.')).toBeTruthy()
    expect((await picker('SQ *LITWARE COFFEE')).value).toBe('c2')
    expect(fake.rpcCalls).toEqual([])
    expect(fake.tables.ingest_candidates[1]!.category_id ?? null).toBeNull()
  })
})

describe('Review asks the AI for categories', () => {
  it('asks by itself when AI is on, once, and stores what comes back as suggestions', async () => {
    const fake = fresh()
    aiOn(fake)
    renderScreen(<ReviewScreen />, fake)

    expect(await screen.findByText(/Suggested a category for 2 rows\. Check each before you approve it\./)).toBeTruthy()
    expect((await row('CORNER MARKET #12')).getByText('✨ Suggested: Groceries')).toBeTruthy()
    expect((await picker('SQ *LITWARE COFFEE')).value).toBe('c2')
    expect(runs(fake)).toHaveLength(1)
    expect(fake.rpcCalls.map((c) => c.name)).not.toContain('approve_candidate')
    expect(fake.tables.ingest_candidates.map((r) => [r.status, r.category_source])).toEqual([['pending', 'model'], ['pending', 'model']])
  })

  it('does not ask by itself again about rows it already asked about on this device', async () => {
    const fake = fresh()
    aiOn(fake, {})
    renderScreen(<ReviewScreen />, fake)
    expect(await screen.findByText(/no suggestion it was sure of/)).toBeTruthy()
    cleanup()

    renderScreen(<ReviewScreen />, fake)
    await screen.findByRole('button', { name: /Suggest categories/ })
    expect(runs(fake)).toHaveLength(1)
  })

  it('with AI off, asks nothing by itself and offers the button', async () => {
    const fake = fresh()
    renderScreen(<ReviewScreen />, fake)
    await screen.findByRole('button', { name: /Suggest categories/ })
    expect(runs(fake)).toEqual([])
    expect(fake.rpcCalls).toEqual([])
  })

  it('asks on the tap, too', async () => {
    const fake = fresh()
    aiOn(fake)
    window.localStorage.setItem('budget.review.suggest-asked', JSON.stringify(['p1', 'p2']))
    renderScreen(<ReviewScreen />, fake)
    fireEvent.click(await screen.findByRole('button', { name: /Suggest categories/ }))
    expect(await screen.findByText(/Suggested a category for 2 rows/)).toBeTruthy()
    expect(runs(fake)).toHaveLength(1)
  })

  it('without 0018, leaves Review as it was with one line, and never asks the AI', async () => {
    const fake = fresh()
    aiOn(fake)
    delete fake.rpcReplies['suggest_candidate_categories']
    renderScreen(<ReviewScreen />, fake)

    expect(await screen.findByText(/Suggested categories need a one-time update\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(runs(fake)).toEqual([])
    expect(screen.queryByRole('button', { name: /Suggest categories/ })).toBeNull()
    fireEvent.change(await picker('CORNER MARKET #12'), { target: { value: 'c1' } })
    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: /Approve/ }))
    expect(await screen.findByText(/^Added\./)).toBeTruthy()
  })

  it('without the helper, says so in one line when asked', async () => {
    const fake = fresh()
    fake.functions.ai = null
    renderScreen(<ReviewScreen />, fake)
    fireEvent.click(await screen.findByRole('button', { name: /Suggest categories/ }))
    expect(await screen.findByText(/Suggested categories need a one-time update\./)).toBeTruthy()
    expect(screen.getByText('SQ *LITWARE COFFEE')).toBeTruthy()
  })

  it('sends nothing while Share shop names is off', async () => {
    const fake = fresh()
    aiOn(fake)
    fake.tables.ai_settings.push({ user_id: 'u1', share_shop_names: false })
    renderScreen(<ReviewScreen />, fake)
    expect(await screen.findByText(/Suggestions are off while Share shop names is off\./)).toBeTruthy()
    expect(runs(fake)).toEqual([])
  })
})
