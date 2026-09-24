import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsScreen } from '../src/screens/SettingsScreen.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

afterEach(cleanup)

describe('SettingsScreen, adding a category', () => {
  it('adds it to the list chosen, starting from Variable expenses', async () => {
    const fake = createFakeSupabase()
    renderScreen(<SettingsScreen />, fake)

    const list = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Which list' })
    expect(list.value).toBe('variable')
    fireEvent.change(screen.getByPlaceholderText('New category'), { target: { value: 'Rent' } })
    fireEvent.change(list, { target: { value: 'bill' } })
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))

    await waitFor(() => expect(fake.tables.categories).toMatchObject([{ name: 'Rent', kind: 'bill', sort_order: 0 }]))
  })
})

describe('SettingsScreen, weekly budgets', () => {
  it('offers a weekly budget only on the lists the Week counts, under their headings (N19)', async () => {
    const cat = (id: string, name: string, kind: Category['kind'], weekly_budget_cents: number | null = null): Category => ({
      id, name, kind, sort_order: 0, weekly_budget_cents,
    })
    const fake = createFakeSupabase({
      categories: [
        cat('c1', 'Groceries', 'variable'),
        cat('c2', 'Rent', 'bill'),
        cat('c3', 'Pay', 'income', 5000),
        cat('c4', 'Flight fund', 'savings'),
        cat('c5', 'Card payments', 'transfer'),
      ],
    })
    renderScreen(<SettingsScreen />, fake)

    await screen.findByRole('textbox', { name: 'Weekly budget for Groceries' })
    const field = (list: string) =>
      within(screen.getByRole('region', { name: list })).getAllByRole('textbox').map((f) => f.getAttribute('aria-label'))
    expect(field('Bills')).toEqual(['Weekly budget for Rent'])
    expect(field('Variable expenses')).toEqual(['Weekly budget for Groceries'])
    for (const name of ['Pay', 'Flight fund', 'Card payments']) {
      expect(screen.queryByRole('textbox', { name: `Weekly budget for ${name}` })).toBeNull()
    }
    // A limit already stored on Income is left as it is.
    expect(fake.tables.categories.find((c) => c.id === 'c3')?.weekly_budget_cents).toBe(5000)
    const lists = [...screen.getByRole<HTMLSelectElement>('combobox', { name: 'Which list' }).options].map((o) => o.text)
    expect(lists).toEqual(['Which list?', 'Bills', 'Debts', 'Subscriptions', 'Variable expenses'])
  })

  it('saves a weekly budget when the field is left, and clears it when emptied', async () => {
    const fake = createFakeSupabase({
      categories: [{ id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 15000 }],
    })
    renderScreen(<SettingsScreen />, fake)

    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Weekly budget for Groceries' })
    await waitFor(() => expect(field.value).toBe('150.00'))
    fireEvent.change(field, { target: { value: '120.50' } })
    fireEvent.blur(field)
    await waitFor(() => expect(fake.tables.categories[0]?.weekly_budget_cents).toBe(12050))

    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    await waitFor(() => expect(fake.tables.categories[0]?.weekly_budget_cents).toBeNull())
  })

  it('refuses a budget that is not money, and saves nothing', async () => {
    const fake = createFakeSupabase({
      categories: [{ id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }],
    })
    renderScreen(<SettingsScreen />, fake)

    const field = await screen.findByRole('textbox', { name: 'Weekly budget for Groceries' })
    // Said in words, on the field, as the Week's editor says it (CR-5).
    const said = () => document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent
    fireEvent.change(field, { target: { value: 'lots' } })
    fireEvent.blur(field)
    expect((await screen.findByRole('alert')).textContent).toBe('Type the weekly budget as an amount, like 150 or 150.00.')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(said()).toBe('Type the weekly budget as an amount, like 150 or 150.00.')

    fireEvent.change(field, { target: { value: '-5' } })
    fireEvent.blur(field)
    expect(await screen.findByText('A weekly budget cannot be below zero.')).toBeTruthy()
    expect(fake.tables.categories[0]?.weekly_budget_cents).toBeNull()

    fireEvent.change(field, { target: { value: '40' } })
    expect(field.getAttribute('aria-invalid')).toBeNull()
  })
})

// The goals moved to Savings (G1): this card says where, and names the main
// goal, and the goal Settings once saved is left exactly as it was.
describe('SettingsScreen, your savings goals', () => {
  const goal = (id: string, name: string, more: Record<string, unknown> = {}) => ({
    id, name, target_cents: 3_000_000, saved_cents: 845_000, target_date: null, unit_cost_cents: 27_500, unit_label: 'flight time', ...more,
  })

  it('names the main goal, and opens Savings, where every goal is kept', async () => {
    const fake = createFakeSupabase({ savings_goals: [goal('g1', 'Flight training'), goal('g2', 'Travel', { sort_order: 1 })] })
    const before = JSON.stringify(fake.tables.savings_goals)
    renderScreen(<SettingsScreen />, fake)

    expect(await screen.findByText('2 goals. Your main goal is Flight training, which the Coach and the Week show.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save goal' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Savings' }))
    expect(window.location.hash).toBe('#/savings')
    expect(JSON.stringify(fake.tables.savings_goals)).toBe(before)
  })

  it('says when there is none yet, or none active', async () => {
    renderScreen(<SettingsScreen />, createFakeSupabase())
    expect(await screen.findByText('None yet. Add one on Savings: flight training, a trip, a rainy-day fund.')).toBeTruthy()
    cleanup()
    renderScreen(<SettingsScreen />, createFakeSupabase({ savings_goals: [goal('g1', 'House', { status: 'paused' })] }))
    expect(await screen.findByText('One goal, none of them active. Resume one on Savings.')).toBeTruthy()
  })
})

describe('SettingsScreen, the way to Setup', () => {
  it('opens Setup', async () => {
    renderScreen(<SettingsScreen />, createFakeSupabase())

    fireEvent.click(await screen.findByRole('button', { name: /Open Setup/ }))
    expect(window.location.hash).toBe('#/setup')
  })
})
