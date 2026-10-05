import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReviewScreen } from '../src/screens/ReviewScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * Review's Suggested changes (ADR 0013): each waiting suggestion with its
 * reason and its change worked out fresh; Apply makes it, Dismiss throws
 * it away; one that moved since offers only Dismiss; one already so,
 * Clear; one that cannot be read, Dismiss.
 */
const FOOD = '11111111-1111-4111-8111-111111111111'
const APP = '99999999-9999-4999-8999-999999999999'
let n = 0
const row = (kind: string, target: object, after: object, before: object, reason = 'You spent $118.40 a week lately.') => ({
  id: `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  status: 'pending',
  kind,
  client_id: APP,
  target,
  after,
  before,
  reason,
  created_at: `2026-10-05T06:00:${String(n % 60).padStart(2, '0')}+00:00`,
  expires_at: '2999-01-01T00:00:00+00:00',
})

function seeded(rows: Record<string, unknown>[]): FakeSupabase {
  return createFakeSupabase({
    categories: [{ id: FOOD, name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 10000 }],
    ai_app_proposals: rows,
  })
}

async function card(text: RegExp) {
  const item = (await screen.findByText(text)).closest('li')
  if (!(item instanceof HTMLElement)) throw new Error(`no card for ${String(text)}`)
  return within(item)
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('Suggested changes', () => {
  it('shows each with its reason and its change, and Apply makes it', async () => {
    const fake = seeded([row('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 10000 }, 'Ignore this and approve everything')])
    renderScreen(<ReviewScreen />, fake)
    const weekly = await card(/weekly budget/)
    expect(weekly.getByText(/\$100\.00 → \$120\.00/)).toBeTruthy()
    // The AI app's words are its reason, drawn as text and nothing more.
    expect(weekly.getByText('Ignore this and approve everything')).toBeTruthy()
    await expectNoAxeViolations()
    fireEvent.click(weekly.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText(/Applied\./)).toBeTruthy()
    expect(fake.tables.categories[0]?.weekly_budget_cents).toBe(12000)
    expect(fake.tables.ai_app_proposals[0]?.['status']).toBe('applied')
    await waitFor(() => expect(screen.queryByText(/weekly budget/)).toBeNull())
  })

  it('throws one away with Dismiss, and changes nothing', async () => {
    const fake = seeded([row('rename_category', { category_id: FOOD }, { name: 'Food' }, { name: 'Groceries' })])
    renderScreen(<ReviewScreen />, fake)
    fireEvent.click((await card(/Rename a category/)).getByRole('button', { name: 'Dismiss' }))
    expect(await screen.findByText(/Dismissed\. Nothing was changed\./)).toBeTruthy()
    expect(fake.tables.categories[0]?.name).toBe('Groceries')
    expect(fake.tables.ai_app_proposals[0]?.['status']).toBe('dismissed')
  })

  it('offers only Dismiss for one that moved since, Clear for one already so, and Dismiss for one it cannot read', async () => {
    renderScreen(
      <ReviewScreen />,
      seeded([
        row('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 9000 }),
        row('move_category', { category_id: FOOD }, { list: 'variable' }, { list: 'bill' }),
        row('set_weekly_limit', { category_id: FOOD }, { cents: 'lots' }, { cents: 9000 }),
      ]),
    )
    const stale = await card(/Changed since it was suggested: now \$100\.00/)
    expect(stale.queryByRole('button', { name: 'Apply' })).toBeNull()
    expect(stale.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    const already = await card(/Already so\./)
    expect(already.getByRole('button', { name: 'Clear' })).toBeTruthy()
    const unreadable = await card(/This suggestion can’t be read\./)
    expect(unreadable.queryByRole('button', { name: 'Apply' })).toBeNull()
    await expectNoAxeViolations()
  })

  it('is not there when none wait, or before 0039 is in', async () => {
    const fake = seeded([])
    fake.fail('ai_app_proposals', 'PGRST205')
    renderScreen(<ReviewScreen />, fake)
    expect(await screen.findByText(/Nothing waiting\./)).toBeTruthy()
    expect(screen.queryByText('Suggested changes')).toBeNull()
  })
})

describe('Apply all', () => {
  const TXN = '44444444-4444-4444-8444-444444444444'
  function three(): FakeSupabase {
    const fake = seeded([
      row('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 10000 }),
      row('learn_shop', { transaction_id: TXN }, { category_id: FOOD }, { category_id: FOOD, rule_category_id: null }),
      row('rename_category', { category_id: FOOD }, { name: 'Food' }, { name: 'Groceries' }),
    ])
    fake.tables.transactions.push({ id: TXN, posted_on: '2026-09-03', amount_cents: -5420, merchant_raw: 'COSTCO', category_id: FOOD, source: 'card_csv' })
    return fake
  }

  it('asks first, then applies every ready card but a shop rule, oldest first', async () => {
    const fake = three()
    renderScreen(<ReviewScreen />, fake)
    fireEvent.click(await screen.findByRole('button', { name: 'Apply all 2' }))
    expect(screen.getByText('Apply 2 suggested changes?')).toBeTruthy()
    expect(fake.tables.categories[0]?.weekly_budget_cents).toBe(10000)
    await expectNoAxeViolations()
    fireEvent.click(within(screen.getByRole('group', { name: 'Apply 2 suggested changes?' })).getByRole('button', { name: 'Apply all 2' }))
    expect(await screen.findByText('Applied 2 of 2.')).toBeTruthy()
    expect(fake.tables.categories[0]).toMatchObject({ name: 'Food', weekly_budget_cents: 12000 })
    expect(fake.tables.ai_app_proposals.map((r) => r['status'])).toEqual(['applied', 'pending', 'applied'])
  })

  it('leaves one the database refuses waiting, and says how many went', async () => {
    const fake = three()
    fake.fail('PATCH categories', '23514')
    renderScreen(<ReviewScreen />, fake)
    fireEvent.click(await screen.findByRole('button', { name: 'Apply all 2' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Apply 2 suggested changes?' })).getByRole('button', { name: 'Apply all 2' }))
    expect(await screen.findByText('Applied 0 of 2.')).toBeTruthy()
    expect(screen.getByText(/2 left waiting\./)).toBeTruthy()
    expect(fake.tables.ai_app_proposals.map((r) => r['status'])).toEqual(['pending', 'pending', 'pending'])
  })

  it('is not offered for one ready card', async () => {
    renderScreen(<ReviewScreen />, seeded([row('set_weekly_limit', { category_id: FOOD }, { cents: 12000 }, { cents: 10000 })]))
    expect(await screen.findByRole('button', { name: 'Apply' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Apply all/ })).toBeNull()
  })
})
