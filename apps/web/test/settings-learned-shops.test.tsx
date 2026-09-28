import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsScreen } from '../src/screens/SettingsScreen.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

afterEach(cleanup)

const cat = (id: string, name: string, kind: Category['kind']): Category => ({ id, name, kind, sort_order: 0, weekly_budget_cents: null })

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('c1', 'Groceries', 'variable'), cat('c2', 'Old gym', 'subscription')],
    merchant_rules: [
      { id: 'r1', match_merchant: 'CONTOSO MARKET', category_id: 'c1' },
      { id: 'r2', match_merchant: '<b>FABRIKAM FITNESS</b>', category_id: 'c2' },
    ],
  })
}

const shops = async () => within(await screen.findByRole('list', { name: 'Learned shops' }))

describe('SettingsScreen, shops filed by themselves (N17)', () => {
  it('lists each learned shop with its category, as text', async () => {
    renderScreen(<SettingsScreen />, seeded())
    const list = await shops()
    expect(list.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '<b>FABRIKAM FITNESS</b>Old gymForget',
      'CONTOSO MARKETGroceriesForget',
    ])
    await expectNoAxeViolations()
  })

  it('forgets one, which leaves its category free to remove, and says what happens next', async () => {
    const fake = seeded()
    renderScreen(<SettingsScreen />, fake)
    fireEvent.click((await shops()).getByRole('button', { name: 'Forget <b>FABRIKAM FITNESS</b>' }))

    expect(await screen.findByText('Forgotten. The next charge from <b>FABRIKAM FITNESS</b> waits in Review for a category.')).toBeTruthy()
    expect(fake.tables.merchant_rules.map((r) => r.match_merchant)).toEqual(['CONTOSO MARKET'])
    expect((await shops()).getAllByRole('listitem')).toHaveLength(1)
  })

  it('keeps the shop, and says why, when forgetting is refused', async () => {
    const fake = seeded()
    fake.fail('DELETE merchant_rules', '42501')
    renderScreen(<SettingsScreen />, fake)
    fireEvent.click((await shops()).getByRole('button', { name: 'Forget CONTOSO MARKET' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)',
    )
    expect(fake.tables.merchant_rules).toHaveLength(2)
  })

  it('says so in one line when the list cannot be read, and the rest of Settings still works', async () => {
    const fake = seeded()
    fake.fail('merchant_rules', '42501')
    renderScreen(<SettingsScreen />, fake)
    expect(await screen.findByText(/^The shops the app has learned could not be read just now\. Try again\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Sign out/ })).toBeTruthy()
  })

  it('says it is loading as every screen does, named for what loads', async () => {
    const fake = seeded()
    fake.server.hold = (table) => (table === 'merchant_rules' ? new Promise<void>(() => undefined) : null)
    renderScreen(<SettingsScreen />, fake)
    expect((await screen.findByRole('status', { name: 'Loading the shops the app has learned' })).textContent).toBe('Loading…')
  })

  it('says none are learned yet', async () => {
    renderScreen(<SettingsScreen />, createFakeSupabase())
    expect(await screen.findByText('None yet. Approve a charge in Review and its shop is learned.')).toBeTruthy()
  })
})
