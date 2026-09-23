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

describe('SetupScreen, changing a list', () => {
  it('renames a category where it stands, keeping its id', async () => {
    const fake = seeded()
    renderScreen(<SetupScreen />, fake)

    const field = await screen.findByRole('textbox', { name: 'Rename Phone' })
    fireEvent.change(field, { target: { value: ' Mobile ' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.blur(field)

    await waitFor(async () => expect(await namesOn('Bills')).toEqual(['Mobile', 'Rent']))
    expect(fake.tables.categories.find((c) => c.id === 'c4')?.name).toBe('Mobile')
  })

  it('puts the old name back for an empty name or Escape, and saves nothing', async () => {
    const fake = seeded()
    renderScreen(<SetupScreen />, fake)

    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Rename Rent' })
    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.blur(field)
    await waitFor(() => expect(field.value).toBe('Rent'))
    fireEvent.change(field, { target: { value: 'Mortgage' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    fireEvent.blur(field)
    expect(field.value).toBe('Rent')
    expect(fake.tables.categories.find((c) => c.id === 'c3')?.name).toBe('Rent')
  })

  it('refuses a name another category has, in words, and keeps the old one', async () => {
    renderScreen(<SetupScreen />, seeded())

    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Rename Rent' })
    fireEvent.change(field, { target: { value: 'Groceries' } })
    fireEvent.blur(field)

    const card = within(screen.getByRole('region', { name: 'Bills' }))
    expect(await card.findByText(/^You already have a category with that name/)).toBeTruthy()
    expect(field.value).toBe('Rent')
  })

  it('adds a category to the bottom of the list it was typed into', async () => {
    const fake = seeded()
    renderScreen(<SetupScreen />, fake)

    const input = await screen.findByRole('textbox', { name: 'New Bills category' })
    fireEvent.change(input, { target: { value: 'Water' } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Bills' })).getByRole('button', { name: /Add/ }))

    await waitFor(async () => expect(await namesOn('Bills')).toEqual(['Phone', 'Rent', 'Water']))
    expect(fake.tables.categories.find((c) => c.name === 'Water')).toMatchObject({ kind: 'bill', sort_order: 2 })
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
