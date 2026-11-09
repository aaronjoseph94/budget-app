import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SavingsScreen } from '../src/screens/SavingsScreen.js'
import { CoachScreen } from '../src/screens/CoachScreen.js'
import { ScreenBoundary } from '../src/shell/ScreenBoundary.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeTables } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Add a goal (and a goal's editor) take a date as the date
 * field gives it, unchecked. A date field takes a year of up to six digits
 * (the HTML rule is "four or more"; Chrome, Firefox and Safari on a computer
 * all let one be typed, and with a year-first locale such as en-CA typing
 * 20270501 straight through gives the year 202705). The goal is saved with
 * that date, and then the app cannot read its own goal: Savings throws as it
 * draws, so the shell shows "This screen did not load", on every visit, and
 * the goal can be neither edited nor removed in the app. The Coach, the
 * Forecast and Ask read goals the same way (coach/goals.ts).
 *
 * The screen is drawn inside the app's own ScreenBoundary, as App draws it.
 */

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)
const fund = (id: string, name: string, sort_order: number): Category => ({ id, name, kind: 'savings', sort_order, weekly_budget_cents: null })
type Goal = FakeTables['savings_goals'][number]
const travel: Goal = {
  id: 'g1', name: 'Travel', target_cents: 100_000, saved_cents: 10_000, target_date: null, unit_cost_cents: null, unit_label: null,
  category_id: 'travel', start_date: null, balance_as_of: '2026-09-01',
}
const CRASHED = 'This screen did not load. Check your connection, then reload.'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  // React reports the render error it caught; the boundary's words are what is asserted.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a goal date with a five-digit year', () => {
  it('Add a goal refuses it, or Savings can still show and edit the goal afterwards', async () => {
    const fake = createFakeSupabase({ categories: [fund('travel', 'Travel', 0)], savings_goals: [travel] })
    renderScreen(
      <ScreenBoundary screen="savings">
        <SavingsScreen />
      </ScreenBoundary>,
      fake,
    )
    // Before: Travel's card is there, with its Edit goal.
    expect(within(await screen.findByRole('region', { name: 'Travel' })).getByRole('button', { name: /Edit/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add a goal' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Add a goal' }))
    fireEvent.change(sheet.getByLabelText(/^Name/), { target: { value: 'Emergency' } })
    fireEvent.change(sheet.getByLabelText(/^Target \(\$\)/), { target: { value: '5000' } })
    const date = sheet.getByLabelText<HTMLInputElement>(/^Target date/)
    fireEvent.change(date, { target: { value: '20277-09-01' } })
    // The date field itself holds it: a year of five digits is a valid date to a browser.
    expect(date.value).toBe('20277-09-01')
    fireEvent.click(sheet.getByRole('button', { name: 'Add goal' }))

    // Wait for the save to settle one way or the other.
    await waitFor(() => {
      const refusedInSheet = screen.queryByRole('dialog', { name: 'Add a goal' })?.querySelector('[role="alert"]') != null
      const stored = fake.tables.savings_goals.length === 2
      expect(refusedInSheet || stored).toBe(true)
    })
    // Refusing the date in the sheet would be a fix; then nothing was stored and the test passes.
    if (fake.tables.savings_goals.length === 1) return

    // It was stored as typed …
    expect(fake.tables.savings_goals[1]).toMatchObject({ name: 'Emergency', target_date: '20277-09-01' })
    // … so the app must still be able to show Savings and reach both goals.
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(screen.queryByText(CRASHED)).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Travel' })).getByRole('button', { name: /Edit/ })).toBeTruthy()
  })

  it('a goal stored with such a date does not take the Coach down either', async () => {
    const fake = createFakeSupabase({
      categories: [fund('travel', 'Travel', 0), fund('rainy', 'Emergency', 1)],
      savings_goals: [travel, { ...travel, id: 'g2', name: 'Emergency', category_id: 'rainy', target_date: '20277-09-01', start_date: '2026-09-23', balance_as_of: '2026-09-23' }],
    })
    renderScreen(
      <ScreenBoundary screen="coach">
        <CoachScreen />
      </ScreenBoundary>,
      fake,
    )
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(screen.queryByText(CRASHED)).toBeNull()
  })
})
