import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SIGNED_OUT_HERE_ONLY } from '../src/supabase.js'
import { SettingsScreen } from '../src/screens/SettingsScreen.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

afterEach(cleanup)

describe('SettingsScreen, Mockup A', () => {
  it('lays the four shortcuts across, then budgets beside the shops and the account', async () => {
    renderScreen(<SettingsScreen />, createFakeSupabase())

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Settings')
    const cardOf = (title: string) => screen.getByRole('heading', { level: 2, name: title }).parentElement!
    const shortcuts = cardOf('Getting started').parentElement!
    expect(shortcuts.className).toContain('xl:grid-cols-4')
    expect([...shortcuts.children].map((c) => c.querySelector('h2')?.textContent)).toEqual(['Getting started', 'Your lists', 'AI settings', 'Your savings goals'])
    // AI settings has no sidebar item, so Settings is a computer's way in (N136).
    fireEvent.click(within(cardOf('AI settings')).getByRole('button', { name: 'Open AI settings' }))
    expect(window.location.hash).toBe('#/ai')
    const pair = cardOf('Weekly budgets').parentElement!
    expect(pair.className).toContain('xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]')
    expect(pair.lastElementChild?.contains(cardOf('Shops filed by themselves'))).toBe(true)
    // AI apps (ADR 0012) between the learned shops and the account.
    expect([...pair.lastElementChild!.children].map((c) => c.querySelector('h2')?.textContent)).toEqual(['Shops filed by themselves', 'AI apps', 'Account'])
    // The address and Sign out share the account card's one row.
    expect(within(cardOf('Account')).getByRole('button', { name: 'Sign out' })).toBeTruthy()
    await screen.findByText(/None yet|Learned shops/)
  })
})

describe('SettingsScreen, signing out', () => {
  it('signs out on this device even when the server cannot be reached, as the sidebar does (security-a-06)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'a-public-anon-key-of-some-length')
    const key = 'sb-abcdefghijklmnopqrst-auth-token'
    window.localStorage.setItem(key, '{"refresh_token":"still-live"}')
    const fake = createFakeSupabase()
    vi.spyOn(fake.client.auth, 'signOut').mockResolvedValue({ error: new Error('Failed to fetch') } as never)
    renderScreen(<SettingsScreen />, fake)
    const account = screen.getByRole('heading', { level: 2, name: 'Account' }).parentElement!
    fireEvent.click(within(account).getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(window.sessionStorage.getItem(SIGNED_OUT_HERE_ONLY)).toBe('1'))
    expect(window.localStorage.getItem(key)).toBeNull()
    window.sessionStorage.removeItem(SIGNED_OUT_HERE_ONLY)
    vi.unstubAllEnvs()
    await screen.findByText(/its shop is learned/)
  })
})

describe('SettingsScreen, adding a category', () => {
  it('adds it to the list chosen, starting from Variable expenses', async () => {
    const fake = createFakeSupabase()
    renderScreen(<SettingsScreen />, fake)

    const list = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Which list' })
    expect(list.value).toBe('variable')
    // From 640px the row reads name, list, Add: the list's box takes the second column
    // explicitly, since a row-only placement would put it before the name.
    expect(list.parentElement?.classList.contains('sm:col-start-2')).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('New category'), { target: { value: 'Rent' } })
    fireEvent.change(list, { target: { value: 'bill' } })
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))

    await waitFor(() => expect(fake.tables.categories).toMatchObject([{ name: 'Rent', kind: 'bill', sort_order: 0 }]))
    await expectNoAxeViolations()
  })

  // e2e-setup-07: the refusal stayed on screen after the next add went in.
  it('takes away why the last add was refused once another goes in', async () => {
    const fake = createFakeSupabase({ categories: [{ id: 'c1', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null }] })
    renderScreen(<SettingsScreen />, fake)

    const name = await screen.findByPlaceholderText('New category')
    fireEvent.change(name, { target: { value: 'Rent' } })
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/You already have “Rent” in Bills/)

    fireEvent.change(name, { target: { value: 'Pet food' } })
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))
    await waitFor(() => expect(fake.tables.categories.map((c) => c.name)).toEqual(['Rent', 'Pet food']))
    await waitFor(() => expect(screen.queryByText(/You already have/)).toBeNull())
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
    expect(await screen.findByText('Your one goal is paused or reached. Resume it on Savings.')).toBeTruthy()
    cleanup()
    renderScreen(
      <SettingsScreen />,
      createFakeSupabase({ savings_goals: [goal('g1', 'House', { status: 'paused' }), goal('g2', 'Car', { status: 'reached', reached_on: '2026-09-01' })] }),
    )
    expect(await screen.findByText('Your 2 goals are all paused or reached. Resume one on Savings.')).toBeTruthy()
  })
})

describe('SettingsScreen, the way to Setup', () => {
  it('opens Setup', async () => {
    renderScreen(<SettingsScreen />, createFakeSupabase())

    fireEvent.click(await screen.findByRole('button', { name: /Open Setup/ }))
    expect(window.location.hash).toBe('#/setup')
  })
})
