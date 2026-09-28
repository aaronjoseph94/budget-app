import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarScreen } from '../src/screens/CalendarScreen.js'
import { DebtsScreen } from '../src/screens/DebtsScreen.js'
import { LedgerScreen } from '../src/screens/LedgerScreen.js'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import { PaycheckScreen } from '../src/screens/PaycheckScreen.js'
import { SavingsScreen } from '../src/screens/SavingsScreen.js'
import { YearScreen } from '../src/screens/YearScreen.js'
import { Loading } from '../src/components/ui/feedback.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 23, 12))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a screen loading', () => {
  it('says so to the eye, and names what is loading to a screen reader', async () => {
    render(<Loading what="this month" />)
    const status = screen.getByRole('status', { name: 'Loading this month' })
    expect([status.textContent, status.getAttribute('aria-busy')]).toEqual(['Loading…', 'true'])
    await expectNoAxeViolations()
  })

  // Each screen's own read is held, so it stays loading.
  it.each<[string, ReactNode, string]>([
    ['this month', <MonthScreen month="2026-09" />, 'transactions'],
    ['this calendar', <CalendarScreen month="2026-09" />, 'transactions'],
    ['this year', <YearScreen start="2026-01" />, 'transactions'],
    ['when you are paid', <PaycheckScreen day={null} />, 'pay_schedules'],
    ['your savings goals', <SavingsScreen />, 'transactions'],
    ['your debts', <DebtsScreen />, 'debts'],
    ['this month’s transactions', <LedgerScreen />, 'transactions'],
  ])('says it is loading %s, the same way on every screen', async (what, page, table) => {
    const fake = createFakeSupabase()
    fake.server.hold = (target) => (target === table ? new Promise<void>(() => undefined) : null)
    renderScreen(page, fake)
    expect((await screen.findByRole('status', { name: `Loading ${what}` })).textContent).toBe('Loading…')
  })
})
