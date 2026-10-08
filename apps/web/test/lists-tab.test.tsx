import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ListsTab } from '../src/settings/ListsTab.js'
import { addCategories, type Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

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
    .map((li) => within(li).queryByRole<HTMLInputElement>('textbox', { name: /^Rename / })?.value ?? li.textContent ?? '')
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Lists, the lists', () => {
  it("shows every list under the workbook's headings, each in its own order, then by name", async () => {
    renderScreen(<ListsTab />, seeded())

    // The band's heading, under Settings' own title (ADR 0014 §2).
    expect(screen.getByRole('heading', { level: 2, name: 'Start here!' })).toBeTruthy()
    // Mockup A: each list's card is its own section, the workbook's section
    // named over its title.
    expect(screen.getAllByRole('heading', { level: 2 }).slice(1).map((h) => [h.previousElementSibling?.textContent, h.textContent])).toEqual([
      ['Source', 'Income'],
      ['Savings', 'Savings'],
      ['Recurring expenses', 'Bills'],
      ['Recurring expenses', 'Debts'],
      ['Recurring expenses', 'Subscriptions'],
      ['Variable expenses', 'Variable expenses'],
      ['Not spending', 'Not spending'],
    ])
    await waitFor(async () => expect(await namesOn('Bills')).toEqual(['Phone', 'Rent']))
    expect(await namesOn('Income')).toEqual(['Pay'])
    expect(await namesOn('Variable expenses')).toEqual(['Groceries', 'Restaurants'])
    expect(await namesOn('Not spending')).toEqual(['Card payments'])
    expect(within(screen.getByRole('region', { name: 'Savings' })).getByText('Nothing here yet.')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Debts' })).getByText('Nothing here yet.')).toBeTruthy()
    // Plan §3.3: the card itself is not a Debts row, or its purchases count twice.
    expect(within(screen.getByRole('region', { name: 'Debts' })).getByText('Bank loans only; a card is Not spending.')).toBeTruthy()
    await expectNoAxeViolations()
  })
})

describe('Lists, the columns', () => {
  const at1280 = (matches: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches && query === '(min-width: 1280px)', addEventListener: () => undefined, removeEventListener: () => undefined }))
  // The list cards' titles, after the name band's heading.
  const titles = () => screen.getAllByRole('heading', { level: 2 }).slice(1).map((h) => h.textContent)

  it('keeps the workbook\'s order in one column below 1280px', () => {
    at1280(false)
    renderScreen(<ListsTab />, seeded())
    expect(titles()).toEqual(['Income', 'Savings', 'Bills', 'Debts', 'Subscriptions', 'Variable expenses', 'Not spending'])
  })

  it('puts the lists with columns on the left from 1280px, each column read top to bottom', () => {
    at1280(true)
    renderScreen(<ListsTab />, seeded())
    expect(titles()).toEqual(['Income', 'Bills', 'Debts', 'Subscriptions', 'Savings', 'Variable expenses', 'Not spending'])
    const [left, right] = [...(screen.getByRole('region', { name: 'Income' }).parentElement?.parentElement?.children ?? [])]
    expect(left?.contains(screen.getByRole('region', { name: 'Subscriptions' }))).toBe(true)
    expect(right?.contains(screen.getByRole('region', { name: 'Savings' }))).toBe(true)
  })
})

describe('Lists, changing a list', () => {
  it('renames a category where it stands, keeping its id', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)

    const field = await screen.findByRole('textbox', { name: 'Rename Phone' })
    fireEvent.change(field, { target: { value: ' Mobile ' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.blur(field)

    await waitFor(async () => expect(await namesOn('Bills')).toEqual(['Mobile', 'Rent']))
    expect(fake.tables.categories.find((c) => c.id === 'c4')?.name).toBe('Mobile')
    // Mockup A's ✓ beside the saved name (design-review P2 item 12), gone at the next keystroke.
    const row = within(screen.getByRole('textbox', { name: 'Rename Mobile' }).closest('li')!)
    expect(row.getByLabelText('Saved')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename Mobile' }), { target: { value: 'Mobile phone' } })
    expect(row.queryByLabelText('Saved')).toBeNull()
  })

  it('puts the old name back for an empty name or Escape, and saves nothing', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)

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
    renderScreen(<ListsTab />, seeded())

    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Rename Rent' })
    fireEvent.change(field, { target: { value: 'Groceries' } })
    fireEvent.blur(field)

    const card = within(screen.getByRole('region', { name: 'Bills' }))
    expect(await card.findByText(/^You already have a category with that name/)).toBeTruthy()
    expect(field.value).toBe('Rent')
  })

  it('adds a category to the bottom of the list it was typed into', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)

    const input = await screen.findByRole('textbox', { name: 'New Bills category' })
    fireEvent.change(input, { target: { value: 'Water' } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Bills' })).getByRole('button', { name: /Add/ }))

    await waitFor(async () => expect(await namesOn('Bills')).toEqual(['Phone', 'Rent', 'Water']))
    expect(fake.tables.categories.find((c) => c.name === 'Water')).toMatchObject({ kind: 'bill', sort_order: 2 })
  })
})

describe('Lists, order and lists', () => {
  it('moves a row up and down its list', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)

    const bills = within(await screen.findByRole('region', { name: 'Bills' }))
    expect(bills.getByRole('button', { name: 'Move Phone up' })).toHaveProperty('disabled', true)
    expect(bills.getByRole('button', { name: 'Move Rent down' })).toHaveProperty('disabled', true)
    fireEvent.click(bills.getByRole('button', { name: 'Move Rent up' }))
    await waitFor(async () => expect(await namesOn('Bills')).toEqual(['Rent', 'Phone']))

    fireEvent.click(await bills.findByRole('button', { name: 'Move Rent down' }))
    await waitFor(async () => expect(await namesOn('Bills')).toEqual(['Phone', 'Rent']))
  })

  // Both start at position 0, ordered by name; the move has to show anyway.
  it('moves a row past one sharing its position', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)

    fireEvent.click(await screen.findByRole('button', { name: 'Move Restaurants up' }))
    await waitFor(async () => expect(await namesOn('Variable expenses')).toEqual(['Restaurants', 'Groceries']))
  })

  it('moves a category to the bottom of another list', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)

    const picker = await screen.findByRole('combobox', { name: 'Move Groceries to another list' })
    expect(within(picker).queryByRole('option', { name: 'Variable expenses' })).toBeNull()
    fireEvent.change(picker, { target: { value: 'bill' } })

    await waitFor(async () => expect(await namesOn('Bills')).toEqual(['Phone', 'Rent', 'Groceries']))
    expect(await namesOn('Variable expenses')).toEqual(['Restaurants'])
    expect(fake.tables.categories.find((c) => c.id === 'c1')).toMatchObject({ kind: 'bill', sort_order: 2 })
  })

  it('says to remove the monthly amount when a move is refused, and moves nothing', async () => {
    const fake = seeded()
    fake.fail('PATCH categories', '23514')
    renderScreen(<ListsTab />, fake)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Move Rent to another list' }), { target: { value: 'debt' } })

    const card = within(screen.getByRole('region', { name: 'Bills' }))
    expect(await card.findByText(/^Remove the monthly amount first/)).toBeTruthy()
    expect(await namesOn('Bills')).toEqual(['Phone', 'Rent'])
  })
})

describe('Lists, removing a category', () => {
  it('removes one with nothing filed under it', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Phone' }))

    await waitFor(async () => expect(await namesOn('Bills')).toEqual(['Rent']))
    expect(fake.tables.categories.some((c) => c.id === 'c4')).toBe(false)
  })

  // e2e-setup-06: Remove went with its row, and focus fell to <body>.
  it('keeps focus on the list: the next row’s Remove, then the card’s heading once it is empty', async () => {
    renderScreen(<ListsTab />, seeded())
    const press = (button: HTMLElement) => {
      button.focus()
      fireEvent.click(button)
    }

    press(await screen.findByRole('button', { name: 'Remove Phone' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Rent' })))
    press(screen.getByRole('button', { name: 'Remove Rent' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Bills' })))
  })

  it('says to move its charges first when something is still filed under it', async () => {
    const fake = seeded()
    fake.tables.transactions.push({ id: 't1', posted_on: '2026-09-01', amount_cents: -160000, merchant_raw: 'LANDLORD', category_id: 'c3', source: 'typed' })
    renderScreen(<ListsTab />, fake)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Rent' }))

    const card = within(screen.getByRole('region', { name: 'Bills' }))
    expect(await card.findByText('This category still has charges or learned shops. On the Month, use Move to… on each charge, with “Always file” ticked. (code 23503)')).toBeTruthy()
    expect(await namesOn('Bills')).toEqual(['Phone', 'Rent'])
  })
})

describe('Lists, your name', () => {
  it('draws a ring round the name field when it has focus, not only a whiter underline (FE-3)', () => {
    renderScreen(<ListsTab />, seeded(), 'Sam')
    const classes = screen.getByRole('textbox', { name: 'My name is' }).classList
    // Mockup A: the field on the accent tint has its own edge and the app's accent ring.
    expect([classes.contains('focus-visible:ring-[3px]'), classes.contains('focus-visible:ring-ring')]).toEqual([true, true])
    // cn() is a plain join, so the field carries one width only; its box sets the rest.
    expect([...classes].filter((c) => /^w-/.test(c))).toEqual(['w-full'])
  })

  it('saves your name to your sign-in when you leave the field', async () => {
    const fake = seeded()
    await fake.signIn()
    renderScreen(<ListsTab />, fake, 'Sam')

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
    renderScreen(<ListsTab />, fake)

    const field = screen.getByRole('textbox', { name: 'My name is' })
    fireEvent.change(field, { target: { value: 'Alex' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.blur(field)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Your name was not saved. Check your connection and try again.')).toBeTruthy()
    expect(fake.user.user_metadata).toEqual({})
  })
})

describe('Lists, starting from the starter list', () => {
  const start = async () => fireEvent.click(await screen.findByRole('button', { name: 'Use the starter list' }))

  it('adds the starter names under each list, after yours, your goal first on Savings', async () => {
    const fake = seeded()
    fake.tables.savings_goals.push({
      id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 0,
      target_date: null, unit_cost_cents: null, unit_label: null,
    })
    renderScreen(<ListsTab />, fake)
    await start()

    // 31 starter names and the goal, less the five already here.
    expect(await screen.findByText('Added 27 example names')).toBeTruthy()
    expect(screen.getByText(/^They are placeholders\. Rename each to your own/)).toBeTruthy()
    expect(await namesOn('Savings')).toEqual(['Flight training', 'Emergency Fund', 'Travel Fund', 'Down Payment', 'Car Repair Fund'])
    expect(await namesOn('Income')).toEqual(['Pay', 'Income 1', 'Income 2', 'Side Hustle', 'Freelance Work', 'Donations'])
    expect(await namesOn('Bills')).toEqual(['Phone', 'Rent', 'Electricity Bill', 'Water Bill', 'Gas Bill', 'Car Insurance', 'Gym Membership'])
    expect(await namesOn('Debts')).toEqual(['Credit Card 1', 'Credit Card 2', 'Car Loan', 'Student Loan'])
    expect(await namesOn('Subscriptions')).toEqual(['Netflix', 'Spotify', 'Dropbox'])
    expect(await namesOn('Variable expenses')).toEqual([
      'Groceries', 'Restaurants', 'Clothing', 'Gas', 'Movie Theater', 'Game Night', 'Card interest & fees',
    ])
    expect(await namesOn('Not spending')).toEqual(['Card payments'])
    // 33 categories now, so the offer is gone and the message stays.
    expect(screen.queryByRole('button', { name: 'Use the starter list' })).toBeNull()
    expect(fake.tables.categories).toHaveLength(33)
  })

  it('adds each name once when pressed twice, and without a goal starts Savings with the starter names', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)
    const button = await screen.findByRole('button', { name: 'Use the starter list' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(await screen.findByText('Added 26 example names')).toBeTruthy()
    expect(fake.tables.categories).toHaveLength(32)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(await namesOn('Savings')).toEqual(['Emergency Fund', 'Travel Fund', 'Down Payment', 'Car Repair Fund'])
  })

  it('is not offered to someone with lists of their own', async () => {
    const fake = createFakeSupabase({
      categories: Array.from({ length: 20 }, (_, i) => category(`c${i}`, `Mine ${i}`, 'variable', i)),
    })
    renderScreen(<ListsTab />, fake)
    // Before the first load every account reads as empty; not offered then either.
    expect(screen.queryByRole('button', { name: 'Use the starter list' })).toBeNull()

    await waitFor(async () => expect(await namesOn('Variable expenses')).toHaveLength(20))
    expect(screen.queryByRole('button', { name: 'Use the starter list' })).toBeNull()
  })

  it('says so when the names could not be added, and adds none', async () => {
    const fake = seeded()
    fake.fail('POST categories', '42501')
    renderScreen(<ListsTab />, fake)
    await start()

    const card = within(screen.getByRole('region', { name: 'Starter list' }))
    expect(await card.findByText(/\(code 42501\)$/)).toBeTruthy()
    expect(fake.tables.categories).toHaveLength(6)
  })
})

describe('addCategories', () => {
  // ON CONFLICT DO NOTHING: a name that arrived in between is skipped by the
  // database, not a refusal of the whole set.
  it('skips a name that is already stored, and counts only what it added', async () => {
    const fake = seeded()
    const rows = [
      { name: 'Rent', kind: 'bill' as const, sortOrder: 5 },
      { name: 'Water Bill', kind: 'bill' as const, sortOrder: 6 },
    ]
    expect(await addCategories(fake.client, 'u1', rows)).toBe(1)
    expect(await addCategories(fake.client, 'u1', rows)).toBe(0)
    expect(await addCategories(fake.client, 'u1', [])).toBe(0)
    expect(fake.tables.categories.filter((c) => c.name === 'Water Bill')).toHaveLength(1)
  })
})
