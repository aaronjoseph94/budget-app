import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

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
  fireEvent.click(screen.getByRole('radio', { name: direction }))
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
    await expectNoAxeViolations()
  })
})

describe('AddScreen, typing one in with a new category', () => {
  it("groups the category picker under the workbook's lists", async () => {
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
    fireEvent.click(screen.getByRole('radio', { name: 'I spent' }))
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Which list' }).value).toBe('variable')
  })
})

describe('AddScreen, which way the money went (FE-2)', () => {
  // It decides the sign written to the ledger, so a screen reader must hear
  // which is chosen, and the eye must see it by more than a fill colour.
  it('is a pair of radios, one checked, and says which with a mark as well as a colour', async () => {
    renderScreen(<AddScreen />, seeded())
    fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))

    const group = screen.getByRole('group', { name: 'Money out or in' })
    const spent = within(group).getByRole<HTMLInputElement>('radio', { name: 'I spent' })
    const received = within(group).getByRole<HTMLInputElement>('radio', { name: 'I received' })
    expect([spent.checked, received.checked]).toEqual([true, false])
    expect(within(spent.closest('label') as HTMLElement).queryByTestId('chosen')).not.toBeNull()

    fireEvent.click(received)
    expect([spent.checked, received.checked]).toEqual([false, true])
    expect(within(received.closest('label') as HTMLElement).queryByTestId('chosen')).not.toBeNull()
    expect(within(spent.closest('label') as HTMLElement).queryByTestId('chosen')).toBeNull()
  })
})

describe('AddScreen, telling what is wrong or missing (FE-8)', () => {
  it('ties the amount message to the amount field', async () => {
    renderScreen(<AddScreen />, seeded())
    fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
    const amount = screen.getByLabelText(/^Amount/)
    expect(amount.getAttribute('aria-invalid')).toBeNull()
    fireEvent.change(amount, { target: { value: 'twelve' } })

    expect(amount.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(amount.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'That amount is not a number of dollars and cents.',
    )
  })

  it('keeps Add pressable, and says what is still needed when it is pressed too soon', async () => {
    const fake = seeded()
    renderScreen(<AddScreen />, fake)
    fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
    expect(screen.getByText('Every field is needed.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/^What was it/), { target: { value: 'Farmers market' } })
    const add = screen.getByRole<HTMLButtonElement>('button', { name: 'Add' })
    expect(add.disabled).toBe(false)
    fireEvent.click(add)

    const missing = await screen.findByRole('alert')
    expect(missing.textContent).toBe('Still needed: an amount and a category.')
    expect(document.activeElement).toBe(missing)
    expect(fake.rpcCalls).toEqual([])

    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '' } })
    fireEvent.click(add)
    expect((await screen.findByRole('alert')).textContent).toBe('Still needed: an amount, a date no later than today and a category.')
  })
})

describe('AddScreen, focus while it saves (FE-6)', () => {
  it('keeps Add focusable while it works, so focus stays on it, and adds once however often it is pressed', async () => {
    const fake = seeded()
    renderScreen(<AddScreen />, fake)
    await typeOne('I spent', '7.50', 'Invented kiosk')
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'c1' } })
    // The re-read after the save waits, so the save is caught mid-way.
    let release = (): void => undefined
    fake.server.hold = (table) => (table === 'categories' ? new Promise<void>((resolve) => (release = resolve)) : null)

    const add = screen.getByRole<HTMLButtonElement>('button', { name: 'Add' })
    add.focus()
    fireEvent.click(add)
    const working = await screen.findByRole<HTMLButtonElement>('button', { name: 'Adding…' })
    expect([working.disabled, working.getAttribute('aria-disabled')]).toEqual([false, 'true'])
    fireEvent.click(working)

    fake.server.hold = null
    release()
    expect(await screen.findByText('Added $7.50 — Invented kiosk.')).toBeTruthy()
    expect(document.activeElement).toBe(add)
    expect(fake.rpcCalls.map((c) => c.name)).toEqual(['add_typed_transaction'])
  })
})

describe('AddScreen, its tabs at 320 px (DT-6-N1)', () => {
  // jsdom lays nothing out; the preview measured "Statement" and its icon
  // 3.5 px past both sides of its tab at 320 px, and whole from 360.
  it('shows the three icons from 360 px only, so each word fits its tab', async () => {
    renderScreen(<AddScreen />, seeded())
    const tabs = await screen.findAllByRole('tab')
    expect(tabs).toHaveLength(3)
    for (const tab of tabs) {
      const icon = tab.querySelector('svg')!.classList
      expect([icon.contains('hidden'), icon.contains('min-[360px]:block'), icon.contains('shrink-0')], tab.textContent ?? '').toEqual([true, true, true])
    }
  })
})

describe('AddScreen, its tabs from the keyboard (FE-15)', () => {
  it('is one stop in the tab order, moved along by the arrow keys, Home and End', async () => {
    renderScreen(<AddScreen />, seeded())
    const tab = (name: RegExp) => screen.getByRole('tab', { name })
    await screen.findByRole('tab', { name: /Statement/ })
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([0, -1, -1])
    const panel = screen.getByRole('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe(tab(/Statement/).id)
    expect(tab(/Statement/).getAttribute('aria-controls')).toBe(panel.id)

    tab(/Statement/).focus()
    fireEvent.keyDown(tab(/Statement/), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tab(/Photo/))
    expect(tab(/Photo/).getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([-1, 0, -1])
    fireEvent.keyDown(tab(/Photo/), { key: 'End' })
    expect(document.activeElement).toBe(tab(/Type it/))
    fireEvent.keyDown(tab(/Type it/), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tab(/Statement/))
    fireEvent.keyDown(tab(/Statement/), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(tab(/Type it/))
    fireEvent.keyDown(tab(/Type it/), { key: 'Home' })
    expect(document.activeElement).toBe(tab(/Statement/))
    expect(screen.getByRole('tabpanel').textContent).toContain('Choose a statement')
  })
})

describe('AddScreen, in Mockup A (step 10)', () => {
  it("takes the Month's title, and draws its tabs on the canvas with muted words measured there", async () => {
    renderScreen(<AddScreen />, seeded())
    const tabs = await screen.findAllByRole('tab')
    expect(screen.getByRole('heading', { level: 1, name: 'Add' }).className).toContain('font-bold')
    expect(screen.getByRole('tablist').className).toContain('bg-canvas')
    expect(tabs.map((t) => [t.className.includes('bg-card'), t.className.includes('text-canvas-muted')])).toEqual([
      [true, false],
      [false, true],
      [false, true],
    ])
  })
})
