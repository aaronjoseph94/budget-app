import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isoDate, periodSheet, type PeriodRow } from '@budget/core'
import { WeekBudgetEditor } from '../src/screens/WeekBudgetEditor.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

/** Groceries' row as core gives it, with the budget in cents or none. */
const row = (budgetCents: number | null): PeriodRow =>
  periodSheet({
    from: isoDate('2026-03-09'),
    to: isoDate('2026-03-15'),
    categories: [{ id: 'c1', name: 'Groceries', kind: 'variable', sortOrder: 0 }],
    budgets: [{ categoryId: 'c1', budgetCents }],
    plans: [],
    entries: [],
    statementPeriodEnds: [],
    startingBalanceCents: null,
  }).blocks.variable.rows[0]!
const seeded = (): FakeSupabase =>
  createFakeSupabase({ categories: [{ id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 15000 }] })

function editor(fake: FakeSupabase, budgetCents: number | null, word: 'Budget' | 'Goal' = 'Budget') {
  const done = { cancel: vi.fn(), saved: vi.fn(), failed: vi.fn() }
  renderScreen(
    <WeekBudgetEditor row={row(budgetCents)} word={word} onCancel={done.cancel} onSaved={done.saved} onFailedAfterClose={done.failed} />,
    fake,
  )
  return done
}
const type = (label: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('WeekBudgetEditor', () => {
  it('saves one amount for every week, through the statement parser', async () => {
    const fake = seeded()
    const done = editor(fake, 15000)
    type('Weekly budget for Groceries', '$1,250.50')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(done.saved).toHaveBeenCalledWith('Groceries: $1,250.50 every week.'))
    expect(fake.tables.categories[0]?.weekly_budget_cents).toBe(125050)
    await expectNoAxeViolations()
  })

  it('clears to no budget, never $0, and offers no clear when none is set', async () => {
    const fake = seeded()
    const done = editor(fake, 15000)
    fireEvent.click(screen.getByRole('button', { name: 'Clear budget' }))

    await waitFor(() => expect(done.saved).toHaveBeenCalledWith('Groceries: no budget every week.'))
    expect(fake.tables.categories[0]?.weekly_budget_cents).toBeNull()
    cleanup()
    editor(seeded(), null, 'Goal')
    expect(screen.getByRole('textbox', { name: 'Weekly goal for Groceries' })).toHaveProperty('placeholder', 'No goal')
    expect(screen.queryByRole('button', { name: 'Clear goal' })).toBeNull()
  })

  it('refuses what is not an amount, or below zero, before sending anything', () => {
    const fake = seeded()
    editor(fake, 15000)
    type('Weekly budget for Groceries', 'lots')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Type the budget as an amount, like 150 or 150.00.')).toBeTruthy()
    type('Weekly budget for Groceries', '-5')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('A budget cannot be below zero.')).toBeTruthy()
    // e2e-plan-01: taken, it broke the week.
    type('Weekly budget for Groceries', '90071992547409.91')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('That amount is too large. The most you can type is $999,999,999.99.')).toBeTruthy()
    expect(fake.tables.categories[0]?.weekly_budget_cents).toBe(15000)
  })

  it('says why a save was refused, and closes on Escape or Cancel', async () => {
    const fake = seeded()
    fake.fail('categories', '42501')
    const done = editor(fake, 15000)
    type('Weekly budget for Groceries', '90')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/Your sign-in does not allow this/)).toBeTruthy()
    expect(done.saved).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Weekly budget for Groceries' }), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(done.cancel).toHaveBeenCalledTimes(2)
  })

  it('hands a refusal that arrives after it closed to the screen, naming the row', async () => {
    const fake = seeded()
    fake.fail('categories', '42501')
    const done = editor(fake, 15000)
    type('Weekly budget for Groceries', '90')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    cleanup()

    await waitFor(() => expect(done.failed).toHaveBeenCalledWith(expect.stringMatching(/^Groceries, weekly budget: Your sign-in/)))
  })
})
