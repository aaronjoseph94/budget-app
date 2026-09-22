import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsScreen } from '../src/screens/SettingsScreen.js'
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

describe('SettingsScreen, budgets and the goal', () => {
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
    fireEvent.change(field, { target: { value: 'lots' } })
    fireEvent.blur(field)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Weekly budget for Groceries' }).className).toContain('border-destructive'))
    expect(fake.tables.categories[0]?.weekly_budget_cents).toBeNull()
  })

  it('saves the goal as typed', async () => {
    const fake = createFakeSupabase()
    renderScreen(<SettingsScreen />, fake)

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Flight fund' } })
    fireEvent.change(screen.getByLabelText('Target ($)'), { target: { value: '12000' } })
    fireEvent.change(screen.getByLabelText(/^Saved so far/), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText(/^Target date/), { target: { value: '2027-06-01' } })
    fireEvent.change(screen.getByLabelText(/^Cost per hour/), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Called'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))

    expect(await screen.findByText('Saved.')).toBeTruthy()
    expect(fake.tables.savings_goals).toMatchObject([
      { name: 'Flight fund', target_cents: 1200000, saved_cents: 50000, target_date: '2027-06-01', unit_cost_cents: null, unit_label: null },
    ])
  })
})

describe('SettingsScreen, the way to Setup', () => {
  it('opens Setup', async () => {
    renderScreen(<SettingsScreen />, createFakeSupabase())

    fireEvent.click(await screen.findByRole('button', { name: /Open Setup/ }))
    expect(window.location.hash).toBe('#/setup')
  })
})
