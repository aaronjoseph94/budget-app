import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReviewScreen } from '../src/screens/ReviewScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      { id: 'c1', name: 'Groceries', weekly_budget_cents: 15000 },
      { id: 'c2', name: 'Eating out', weekly_budget_cents: null },
    ],
    ingest_candidates: [
      { id: 'p1', posted_on: '2026-03-09', amount_cents: -1349, merchant: 'LITWARE COFFEE', merchant_raw: 'SQ *LITWARE COFFEE', status: 'pending' },
      { id: 'p2', posted_on: '2026-03-10', amount_cents: -6412, merchant: 'CORNER MARKET', merchant_raw: 'CORNER MARKET #12', status: 'pending' },
      { id: 'p3', posted_on: '2026-03-11', amount_cents: 2500, merchant: 'ADVENTURE WORKS', merchant_raw: 'ADVENTURE WORKS REFUND', status: 'pending' },
      { id: 'x1', posted_on: '2026-03-08', amount_cents: -999, merchant: 'CONTOSO FUEL', merchant_raw: 'CONTOSO FUEL', status: 'approved' },
    ],
    // Filed before: the screen should suggest Groceries, not approve it.
    merchant_rules: [{ match_merchant: 'CORNER MARKET', category_id: 'c1' }],
  })
}

/** One queue row, found by the merchant text it shows. */
async function row(merchantRaw: string) {
  const item = (await screen.findByText(merchantRaw)).closest('li')
  if (!(item instanceof HTMLElement)) throw new Error(`no row for ${merchantRaw}`)
  return within(item)
}

afterEach(cleanup)

describe('ReviewScreen', () => {
  it('lists what is waiting, with amounts and the suggestion from a learned rule', async () => {
    renderScreen(<ReviewScreen />, seeded())

    expect(await screen.findByText(/3 waiting for a category\./)).toBeTruthy()
    expect(screen.queryByText('CONTOSO FUEL')).toBeNull()

    const coffee = await row('SQ *LITWARE COFFEE')
    expect(coffee.getByText('-$13.49')).toBeTruthy()
    expect(coffee.getByRole('button', { name: /Approve/ })).toHaveProperty('disabled', true)

    const market = await row('CORNER MARKET #12')
    expect(market.getByRole<HTMLSelectElement>('combobox', { name: 'Category' }).value).toBe('c1')
    expect(market.getByText('Suggested')).toBeTruthy()
    expect((await row('ADVENTURE WORKS REFUND')).getByText('$25.00')).toBeTruthy()
  })

  it('approves into the chosen category through approve_candidate', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    const coffee = await row('SQ *LITWARE COFFEE')
    fireEvent.change(coffee.getByRole('combobox', { name: 'Category' }), { target: { value: 'c2' } })
    fireEvent.click(coffee.getByRole('button', { name: /Approve/ }))

    expect(await screen.findByText(/^Added\./)).toBeTruthy()
    expect(fake.rpcCalls).toEqual([{ name: 'approve_candidate', args: { p_candidate: 'p1', p_category: 'c2' } }])
  })

  it('approves a suggested row into the suggested category', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: /Approve/ }))

    await waitFor(() =>
      expect(fake.rpcCalls).toEqual([{ name: 'approve_candidate', args: { p_candidate: 'p2', p_category: 'c1' } }]),
    )
  })

  it('creates a new category first, then approves into it', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    const coffee = await row('SQ *LITWARE COFFEE')
    fireEvent.change(coffee.getByRole('combobox', { name: 'Category' }), { target: { value: '__new__' } })
    fireEvent.change(coffee.getByPlaceholderText(/Category name/), { target: { value: '  Coffee  ' } })
    fireEvent.click(coffee.getByRole('button', { name: /Approve/ }))

    await screen.findByText(/^Added\./)
    const created = fake.tables.categories.find((c) => c.name === 'Coffee')
    expect(created).toBeDefined()
    expect(fake.rpcCalls).toEqual([{ name: 'approve_candidate', args: { p_candidate: 'p1', p_category: created?.id } }])
  })

  it('says so when the charge was already in the ledger', async () => {
    const fake = seeded()
    fake.rpcReplies.approve_candidate = 'already_in_ledger'
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: /Approve/ }))

    expect(await screen.findByText('You already had that one, so nothing was added.')).toBeTruthy()
  })

  it('removes a row through reject_candidate', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('ADVENTURE WORKS REFUND')).getByRole('button', { name: /remove/ }))

    expect(await screen.findByText('Removed from the queue. It will not be counted.')).toBeTruthy()
    expect(fake.rpcCalls).toEqual([{ name: 'reject_candidate', args: { p_candidate: 'p3' } }])
  })

  it('shows a readable message when approving fails, and keeps the queue', async () => {
    const fake = seeded()
    fake.fail('rpc/approve_candidate', '28000')
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: /Approve/ }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('That did not work')).toBeTruthy()
    expect(
      within(alert).getByText('You are not signed in any more. Sign in again and retry — nothing was saved. (code 28000)'),
    ).toBeTruthy()
    expect(screen.getByText('CORNER MARKET #12')).toBeTruthy()
    expect(screen.queryByText(/^Added\./)).toBeNull()
  })

  it('shows a readable message when the queue cannot be loaded', async () => {
    const fake = seeded()
    fake.fail('merchant_rules', '42501')
    renderScreen(<ReviewScreen />, fake)

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByText('Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)'),
    ).toBeTruthy()
  })
})
