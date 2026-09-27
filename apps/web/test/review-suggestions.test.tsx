import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReviewScreen } from '../src/screens/ReviewScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
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
