import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YearScreen } from '../src/screens/YearScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon: the gate is September. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

// Nothing typed: the picker, the address and a failed read need no rows.
const seeded = (): FakeSupabase => createFakeSupabase()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('YearScreen', () => {
  it('opens on this calendar year from January', async () => {
    renderScreen(<YearScreen start={null} />, seeded())
    expect(await screen.findByText('January 2026 to December 2026')).toBeTruthy()
  })

  it('starts where the picker says, across a year end, through the address', async () => {
    renderScreen(<YearScreen start="2026-01" />, seeded())

    fireEvent.change(screen.getByRole('combobox', { name: 'Start month' }), { target: { value: '04' } })
    expect(window.location.hash).toBe('#/year/2026-04')
    fireEvent.change(screen.getByRole('combobox', { name: 'Start year' }), { target: { value: '2025' } })
    expect(window.location.hash).toBe('#/year/2025-01')

    cleanup()
    renderScreen(<YearScreen start="2026-04" />, seeded())
    expect(await screen.findByText('April 2026 to March 2027')).toBeTruthy()
  })

  it('shows no year when a read fails, and says why', async () => {
    const fake = seeded()
    fake.fail('category_budgets', 'PGRST205')
    renderScreen(<YearScreen start="2026-01" />, fake)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Could not load this year.*0008/)
  })
})
