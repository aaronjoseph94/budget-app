import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { HABITS_TODAY, habitsFake } from './habits-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const card = async (title: string) => (await screen.findByRole('heading', { name: title })).closest('div.rounded-xl') as HTMLElement
const openHabits = async () => fireEvent.click(await screen.findByRole('tab', { name: 'Habits' }))
const figure = (within_: HTMLElement, label: string) => within(within_).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent

beforeAll(() => warmScreen('#/reports', 'Reports'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(HABITS_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
  window.location.hash = ''
})

describe('Reports, Habits: the spending grid (plan §2.6, A18)', () => {
  it('draws 26 weeks of everyday spending against the daily allowance, every figure core’s', async () => {
    go('/reports')
    renderScreen(<Shell />, habitsFake())
    await openHabits()

    const grid = await card('Your spending grid')
    expect(within(grid).getByText(/each day of the last 26 weeks\. Against \$30\.00 a day: your weekly budgets spread over the week\./)).toBeTruthy()
    expect(within(grid).getByRole('img', { name: 'Everyday spending, day by day, from 30 Mar' })).toBeTruthy()
    // 25 Saturdays of Groceries and five Dining out days over; Coffee's $5.00 up to half; Rent is a bill.
    expect(figure(grid, 'Days with no everyday spending')).toBe('148 of 179')
    expect(figure(grid, 'Days over one and a half times the allowance')).toBe('30')
    expect(figure(grid, 'Days up to half the allowance')).toBe('1')
    expect(within(grid).getByText('Week of 21 Sep: $5.00 · Mon $5.00, Tue $0.00, Wed $0.00, Thu $0.00, Fri to come, Sat to come, Sun to come')).toBeTruthy()
    // Habits reads to today, so there is no month to step through, and nothing is "so far".
    expect(screen.getByRole('navigation', { name: 'Month' }).classList.contains('hidden')).toBe(true)
    expect(screen.queryByText('So far')).toBeNull()
  })

  it('leaves the days before the records blank, never $0, and remembers the tab', async () => {
    go('/reports')
    renderScreen(<Shell />, habitsFake('2026-08-08'))
    await openHabits()

    const grid = await card('Your spending grid')
    expect(within(grid).getByText(/each day of the last 8 weeks\./)).toBeTruthy()
    expect(within(grid).getByText(/^Week of 3 Aug: \$60\.00 · Mon no records, .*Fri no records, Sat \$60\.00, Sun \$0\.00$/)).toBeTruthy()

    cleanup()
    renderScreen(<Shell />, habitsFake())
    expect((await screen.findByRole('tab', { name: 'Habits' })).getAttribute('aria-selected')).toBe('true')
  })

  it('with no weekly budget, sets each day against the usual day of spending', async () => {
    go('/reports')
    renderScreen(<Shell />, habitsFake('2026-02-01', false))
    await openHabits()

    const grid = await card('Your spending grid')
    // Thirty-one days of spending: 25 at $60, the five Dining out days and $5; the middle is $60.00.
    expect(within(grid).getByText(/Against \$60\.00 a day: your usual day of spending, since no weekly budget is set\./)).toBeTruthy()
  })

  it('says in one line that a one-time update is missing, pointing to Help, and the Month still works', async () => {
    const fake = habitsFake()
    fake.fail('transactions', '42P01')
    go('/reports')
    renderScreen(<Shell />, fake)
    await openHabits()

    expect(await screen.findByText(/^Reports need a one-time update./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    fake.heal('transactions')
    go('/month')
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
  })
})
