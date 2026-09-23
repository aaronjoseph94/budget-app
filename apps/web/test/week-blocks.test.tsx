import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isoDate, weekSheet, type WeekCategory } from '@budget/core'
import { WeekBlocks } from '../src/screens/WeekBlocks.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

const cat = (id: string, name: string, kind: WeekCategory['kind'], weeklyBudgetCents: number | null = null): WeekCategory => ({
  id, name, kind, sortOrder: 0, weeklyBudgetCents,
})
const CATEGORIES = [
  cat('c1', 'Groceries', 'variable', 15000),
  cat('c2', 'Eating out', 'variable', 6000),
  cat('rent', 'Rent', 'bill'),
  cat('pay', 'Pay', 'income', 50000),
  cat('fund', 'Flight fund', 'savings', 15000),
  cat('card', 'Card payments', 'transfer'),
]
const entry = (postedOn: string, amountCents: number, categoryId: string) => ({ postedOn: isoDate(postedOn), amountCents, categoryId })

/** The week of Monday 9 March 2026, from core, as the screen would pass it. */
function sheet(categories: WeekCategory[], entries: ReturnType<typeof entry>[], dueDay = 10) {
  return weekSheet({
    asOf: isoDate('2026-03-11'),
    categories,
    entries,
    planHistory: [{ categoryId: 'rent', effectiveMonth: isoDate('2026-01-01'), plannedCents: 160000, dueDay }],
    statementPeriodEnds: [isoDate('2026-03-07')],
    startingBalanceCents: null,
  })
}
const WEEK = [
  entry('2026-03-09', -6412, 'c1'),
  entry('2026-03-10', -1845, 'c2'),
  entry('2026-03-11', -4755, 'c2'),
  entry('2026-03-12', 2500, 'pay'),
  entry('2026-03-10', -20000, 'fund'),
  entry('2026-03-11', 50000, 'card'),
]

function show(s: ReturnType<typeof sheet>, onUnsaved = vi.fn()) {
  const fake = createFakeSupabase({
    categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, kind: c.kind, sort_order: 0, weekly_budget_cents: c.weeklyBudgetCents })),
  })
  renderScreen(<WeekBlocks sheet={s} aside={<p>The goal</p>} onUnsaved={onUnsaved} />, fake)
  return { fake, onUnsaved }
}
const region = (name: string) => within(screen.getByRole('region', { name }))
const band = (name: string) => region(name).getByRole('heading').nextSibling?.textContent
const cells = (name: string, row: string) =>
  within(region(name).getByRole('rowheader', { name: row }).closest('tr')!)
    .getAllByRole('cell')
    .map((c) => c.textContent)
const summary = (label: string) => region('Summary').getByText(label).nextSibling?.textContent

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('WeekBlocks', () => {
  // Hand-derived. Variable: 64.12 + 66.00 = 130.12 of 210.00; Rent's 1,600.00
  // is due on the 10th, in the week; Spent 1,730.12. Left: 85.88 − 6.00 = 79.88.
  it("lays out the week's summary and six blocks, with weekly budgets and a planned bill", () => {
    show(sheet(CATEGORIES, WEEK))

    expect(summary('Spent')).toBe('$1,730.12')
    expect(summary('Left to spend')).toBe('$79.88')
    expect(band('Variable expenses')).toBe('$130.12 of $210.00')
    expect(cells('Variable expenses', 'Groceries')).toEqual(['150.00', '64.12', '85.88'])
    expect(cells('Variable expenses', 'Eating out')).toEqual(['60.00', '66.00', '-6.00'])
    expect(cells('Bills', 'Rent')).toEqual(['', '1,600.00planned', ''])
    expect(cells('Income', 'Pay')).toEqual(['500.00', '25.00'])
    // 200.00 saved against a 150.00 weekly goal (F6).
    expect(cells('Savings', 'Flight fund')).toEqual(['150.00', '200.00', '50.00'])
    expect(screen.getByText('The goal')).toBeTruthy()
    expect(screen.getByText('Statement imported up to 7 Mar 2026')).toBeTruthy()
    expect(region('Variable expenses').queryByRole('button', { name: 'Groceries' })).toBeNull()
  })

  it('leaves a card payment out of every block and says so, and a bill due another day out of the week', () => {
    show(sheet(CATEGORIES, WEEK, 20))

    expect(screen.getByText('$500.00').closest('p')?.textContent).toBe(
      'Paid to your card: $500.00 — not counted. What it paid for is already in the blocks above.',
    )
    expect(screen.queryByText('Card payments')).toBeNull()
    expect(summary('Spent')).toBe('$130.12')
  })

  // Hand-derived: a 40.00 return with no purchase and 15.00 moved out; no Variable budgets, so
  // Left to spend is minus what was spent: −(64.12 + 66.00 − 40.00) = −90.12.
  it('shows a return and an overspent week below zero, and money moved out as not counted', () => {
    const unbudgeted = [...CATEGORIES.map((c) => ({ ...c, weeklyBudgetCents: null })), cat('shoes', 'Shoes', 'variable')]
    show(sheet(unbudgeted, [...WEEK.slice(0, 3), entry('2026-03-12', 4000, 'shoes'), entry('2026-03-12', -1500, 'card')], 20))

    expect(summary('Left to spend')).toBe('-$90.12')
    expect(screen.getByText('No weekly budgets on Variable expenses yet.')).toBeTruthy()
    expect(cells('Variable expenses', 'Shoes')[1]).toBe('-40.00')
    expect(screen.getByText('$15.00').closest('p')?.textContent).toBe('Moved out, not spending: $15.00 — not counted.')
  })

  it('types a weekly budget in its row, and clears an earlier refusal as the editor opens', async () => {
    const { fake, onUnsaved } = show(sheet(CATEGORIES, WEEK))

    fireEvent.click(region('Variable expenses').getByRole('button', { name: 'Budget for Groceries, $150.00' }))
    expect(onUnsaved).toHaveBeenCalledWith(null)
    fireEvent.change(screen.getByRole('textbox', { name: 'Weekly budget for Groceries' }), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await region('Variable expenses').findByText('Groceries: $200.00 every week.')).toBeTruthy()
    expect(fake.tables.categories[0]?.weekly_budget_cents).toBe(20000)
    expect(screen.queryByRole('textbox', { name: 'Weekly budget for Groceries' })).toBeNull()
  })
})
