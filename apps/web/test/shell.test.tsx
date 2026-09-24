import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** The phone's bottom bar comes after the desktop one. */
const phoneBar = () => screen.getAllByRole('navigation', { name: 'Screens' })[1]!

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

describe('Shell', () => {
  it('opens on this month, with Month, Week, Add, Review and More on the phone bar', async () => {
    renderScreen(<Shell />, createFakeSupabase())

    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
    const labels = within(phoneBar()).getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['Month', 'Week', 'Add', 'Review', 'More'])
    expect(within(phoneBar()).getByRole('button', { name: 'Month' }).getAttribute('aria-current')).toBe('page')
  })

  it('gives every tab on the desktop bar an icon of its own', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })

    const desk = screen.getAllByRole('navigation', { name: 'Screens' })[0]!
    const drawn = within(desk).getAllByRole('button').map((b) => b.querySelector('svg')?.innerHTML)
    expect(new Set(drawn).size).toBe(drawn.length)
  })

  it('steps months through the address, so a refresh and the back gesture land on the same one', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(window.location.hash).toBe('#/month/2026-08')
    go('/month/2026-08')
    expect(await screen.findByRole('heading', { name: 'August 2026' })).toBeTruthy()

    // Across a year end.
    go('/month/2025-12')
    fireEvent.click(await screen.findByRole('button', { name: 'Next month' }))
    expect(window.location.hash).toBe('#/month/2026-01')
  })

  it('keeps Paycheck, the Bill calendar, Year, Savings, Debts, Setup, All transactions and Settings under More, and lights More while they show', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    fireEvent.click(within(phoneBar()).getByRole('button', { name: 'More' }))
    expect(window.location.hash).toBe('#/more')
    go('/more')

    const items = (await screen.findAllByRole('listitem')).map((li) => li.querySelector('.font-medium')?.textContent)
    expect(items).toEqual(['Paycheck', 'Bill calendar', 'Year', 'Savings', 'Debts', 'Setup', 'All transactions', 'Settings'])

    fireEvent.click(screen.getByRole('button', { name: /All transactions/ }))
    expect(window.location.hash).toBe('#/ledger')
    go('/ledger')
    expect(within(phoneBar()).getByRole('button', { name: 'More' }).getAttribute('aria-current')).toBe('page')
  })

  it('opens the Year, fetched on first use, from More on a phone and from the bar on a desktop', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    go('/more')
    fireEvent.click(within(await screen.findByRole('list')).getByRole('button', { name: /^Year/ }))
    expect(window.location.hash).toBe('#/year')
    go('/year')
    expect(await screen.findByRole('heading', { name: 'Year' })).toBeTruthy()
    expect(within(phoneBar()).getByRole('button', { name: 'More' }).getAttribute('aria-current')).toBe('page')
    const desktopBar = screen.getAllByRole('navigation', { name: 'Screens' })[0]!
    expect(within(desktopBar).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Month', 'Week', 'Paycheck', 'Calendar', 'Year', 'Savings', 'Debts', 'Review', 'Add', 'Setup', 'More',
    ])
    expect(within(desktopBar).getByRole('button', { name: 'Year' }).getAttribute('aria-current')).toBe('page')
  })

  it('opens Savings from More on a phone, and from the bar on a desktop', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    go('/more')
    fireEvent.click(within(await screen.findByRole('list')).getByRole('button', { name: /^Savings/ }))
    expect(window.location.hash).toBe('#/savings')
    go('/savings')
    expect(await screen.findByRole('heading', { name: 'Savings goals' })).toBeTruthy()
    const desktopBar = screen.getAllByRole('navigation', { name: 'Screens' })[0]!
    expect(within(desktopBar).getByRole('button', { name: 'Savings' }).getAttribute('aria-current')).toBe('page')
    expect(within(phoneBar()).getByRole('button', { name: 'More' }).getAttribute('aria-current')).toBe('page')
  })

  it('opens Debts from More on a phone, and from the bar on a desktop', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    go('/more')
    fireEvent.click(within(await screen.findByRole('list')).getByRole('button', { name: /^Debts/ }))
    expect(window.location.hash).toBe('#/debts')
    go('/debts')
    expect(await screen.findByRole('heading', { name: 'Debt payoff' })).toBeTruthy()
    const desktopBar = screen.getAllByRole('navigation', { name: 'Screens' })[0]!
    expect(within(desktopBar).getByRole('button', { name: 'Debts' }).getAttribute('aria-current')).toBe('page')
    expect(within(phoneBar()).getByRole('button', { name: 'More' }).getAttribute('aria-current')).toBe('page')
  })

  it('opens the Bill calendar from More on a phone, and from the bar on a desktop, at this month', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    go('/more')
    fireEvent.click(within(await screen.findByRole('list')).getByRole('button', { name: /^Bill calendar/ }))
    expect(window.location.hash).toBe('#/calendar')
    go('/calendar')
    expect(await screen.findByText('Bill calendar')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy()
    const desktopBar = screen.getAllByRole('navigation', { name: 'Screens' })[0]!
    expect(within(desktopBar).getByRole('button', { name: 'Calendar' }).getAttribute('aria-current')).toBe('page')
    expect(within(phoneBar()).getByRole('button', { name: 'More' }).getAttribute('aria-current')).toBe('page')
  })

  it('shows the review count on the Review tab', async () => {
    const fake = createFakeSupabase({
      ingest_candidates: [
        { id: 'p1', posted_on: '2026-09-10', amount_cents: -1349, merchant: 'LITWARE COFFEE', merchant_raw: 'LITWARE COFFEE', status: 'pending' },
      ],
    })
    renderScreen(<Shell />, fake)
    expect(await within(phoneBar()).findByRole('button', { name: 'Review, 1 waiting' })).toBeTruthy()
  })
})
