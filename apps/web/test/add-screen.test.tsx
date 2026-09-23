import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

function seeded(): FakeSupabase {
  const fake = createFakeSupabase({
    categories: [{ id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }],
  })
  fake.rpcReplies.add_typed_transaction = null
  return fake
}

/** Open Type it and fill in everything but the category. */
async function typeOne(direction: 'I spent' | 'I received', amount: string, what: string) {
  fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
  fireEvent.click(screen.getByRole('button', { name: direction }))
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: amount } })
  fireEvent.change(screen.getByLabelText('What was it?'), { target: { value: what } })
  fireEvent.change(await screen.findByRole('combobox', { name: 'Category' }), { target: { value: '__new__' } })
}

const offered = () =>
  within(screen.getByRole('combobox', { name: 'Which list' }))
    .getAllByRole('option')
    .map((o) => o.textContent)

afterEach(cleanup)

describe('AddScreen, what it is for', () => {
  // Pay and savings moves are typed (plan §3.3, decision 8), and never on a
  // card statement, so the screen says so rather than "for cash" alone.
  it('says pay and moves to savings are typed here, as well as cash', async () => {
    renderScreen(<AddScreen />, seeded())

    expect(await screen.findByText(/or one by hand: cash, pay or a move to savings\./)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Type it/ }))
    expect(screen.getByText(/^For what a card statement never shows: cash, pay and moves to savings\./)).toBeTruthy()
  })
})

describe('AddScreen, typing one in with a new category', () => {
  it("groups the category picker under Workbook's lists", async () => {
    renderScreen(<AddScreen />, seeded())

    fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
    const picker = screen.getByRole('combobox', { name: 'Category' })
    const group = await within(picker).findByRole('group', { name: 'Variable expenses' })
    expect(within(group).getByRole('option', { name: 'Groceries' })).toBeTruthy()
  })

  // Pay filed under Variable expenses would count as negative spending, so
  // money received is never offered that list, and starts on Income.
  it('files money received under Income, and never offers Variable expenses', async () => {
    const fake = seeded()
    renderScreen(<AddScreen />, fake)

    await typeOne('I received', '1500', 'Paycheque')
    fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'Pay' } })
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Which list' }).value).toBe('income')
    expect(offered()).toEqual(['Which list?', 'Income', 'Savings', 'Not spending'])
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Added $1,500.00 — Paycheque.')).toBeTruthy()
    const pay = fake.tables.categories.find((c) => c.name === 'Pay')
    expect(pay).toMatchObject({ kind: 'income', sort_order: 0 })
    expect(fake.rpcCalls.map((c) => [c.name, c.args.p_amount_cents, c.args.p_category])).toEqual([
      ['add_typed_transaction', 150000, pay?.id],
    ])
  })

  it('starts money spent on Variable expenses, where it can be changed', async () => {
    const fake = seeded()
    renderScreen(<AddScreen />, fake)

    await typeOne('I spent', '12.50', 'Farmers market')
    fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'Market' } })
    const list = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Which list' })
    expect(list.value).toBe('variable')
    expect(offered()).not.toContain('Income')
    fireEvent.change(list, { target: { value: 'subscription' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await screen.findByText('Added $12.50 — Farmers market.')
    expect(fake.tables.categories.find((c) => c.name === 'Market')).toMatchObject({ kind: 'subscription' })
    expect(fake.rpcCalls[0]?.args.p_amount_cents).toBe(-1250)
  })

  it('moves back to Variable expenses when switched from received to spent', async () => {
    renderScreen(<AddScreen />, seeded())

    await typeOne('I received', '5', 'Refund')
    fireEvent.click(screen.getByRole('button', { name: 'I spent' }))
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Which list' }).value).toBe('variable')
  })
})
