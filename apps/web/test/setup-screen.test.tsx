import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SetupScreen } from '../src/screens/SetupScreen.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

const category = (id: string, name: string, kind: Category['kind'], sortOrder: number): Category => ({
  id,
  name,
  kind,
  sort_order: sortOrder,
  weekly_budget_cents: null,
})

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      category('c1', 'Groceries', 'variable', 0),
      category('c2', 'Restaurants', 'variable', 0),
      category('c3', 'Rent', 'bill', 1),
      category('c4', 'Phone', 'bill', 0),
      category('c5', 'Pay', 'income', 0),
      category('c6', 'Card payments', 'transfer', 0),
    ],
  })
}

/** The names shown on one list's card, in order. */
async function namesOn(list: string): Promise<string[]> {
  const card = await screen.findByRole('region', { name: list })
  return within(card)
    .queryAllByRole('listitem')
    .map((li) => within(li).queryByRole<HTMLInputElement>('textbox')?.value ?? li.textContent ?? '')
}

afterEach(cleanup)

describe('SetupScreen, the lists', () => {
  it("shows every list under Workbook's headings, each in its own order, then by name", async () => {
    renderScreen(<SetupScreen />, seeded())

    expect(screen.getByRole('heading', { level: 1, name: 'Start here!' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Income',
      'Savings',
      'Recurring expenses',
      'Variable expenses',
      'Not spending',
    ])
    await waitFor(async () => expect(await namesOn('Bills')).toEqual(['Phone', 'Rent']))
    expect(await namesOn('Income')).toEqual(['Pay'])
    expect(await namesOn('Variable expenses')).toEqual(['Groceries', 'Restaurants'])
    expect(await namesOn('Not spending')).toEqual(['Card payments'])
    expect(within(screen.getByRole('region', { name: 'Savings' })).getByText('Nothing here yet.')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Debts' })).getByText('Nothing here yet.')).toBeTruthy()
  })
})

describe('SetupScreen, your name', () => {
  it('saves your name to your sign-in when you leave the field', async () => {
    const fake = seeded()
    await fake.signIn()
    renderScreen(<SetupScreen />, fake, 'Sam')

    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'My name is' })
    expect(field.value).toBe('Sam')
    fireEvent.change(field, { target: { value: '  Alex ' } })
    fireEvent.blur(field)

    await waitFor(() => expect(fake.user.user_metadata).toEqual({ display_name: 'Alex' }))
    expect(await screen.findByLabelText('Saved')).toBeTruthy()
  })

  it('says so when your name could not be saved', async () => {
    const fake = seeded()
    await fake.signIn()
    fake.fail('auth/user', '500')
    renderScreen(<SetupScreen />, fake)

    const field = screen.getByRole('textbox', { name: 'My name is' })
    fireEvent.change(field, { target: { value: 'Alex' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.blur(field)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Your name was not saved. Check your connection and try again.')).toBeTruthy()
    expect(fake.user.user_metadata).toEqual({})
  })
})
