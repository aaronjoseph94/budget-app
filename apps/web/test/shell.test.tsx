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
    // Fetched on first use now (PERF-3), so its heading is waited for too.
    expect(await screen.findByText('Bill calendar')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
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

describe('Shell, before the shared data has loaded (FE-7)', () => {
  it('says it is loading, rather than showing empty lists or invented defaults', async () => {
    const fake = createFakeSupabase()
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    fake.server.hold = (table) => (table === 'categories' ? held : null)
    go('/settings')
    renderScreen(<Shell />, fake)

    const loading = await screen.findByRole('status', { name: 'Loading your budget' })
    expect(loading.getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText('No spending categories yet')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save goal' })).toBeNull()

    fake.server.hold = null
    release()
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Loading your budget' })).toBeNull()
  })

  it('says it could not load, with a way to try again that works', async () => {
    const fake = createFakeSupabase()
    fake.fail('categories', '42501')
    go('/settings')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('Could not load your data')).toBeTruthy()
    expect(screen.queryByText('No spending categories yet')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Settings' })).toBeNull()

    fake.heal('categories')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.queryByText('Could not load your data')).toBeNull()
  })
})

describe('Shell, skipping the screens bar (FE-10)', () => {
  it('starts with a link that takes focus past the bar to the screen, and keeps the address', async () => {
    go('/week')
    const { container } = renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('main')

    const skip = container.querySelector('a, button')
    expect(skip?.textContent).toBe('Skip to content')
    fireEvent.click(skip!)
    expect(document.activeElement).toBe(screen.getByRole('main'))
    expect(window.location.hash).toBe('#/week')
  })
})

describe('Shell, telling a screen reader the screen changed (FE-13)', () => {
  it('names each screen in the title, and moves focus to it when another is chosen', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(document.title).toBe('Month · Budget')
    // Opening the app leaves focus where the browser put it.
    expect(document.activeElement).toBe(document.body)

    fireEvent.click(within(phoneBar()).getByRole('button', { name: 'Review' }))
    go('/review')
    expect(document.title).toBe('Review · Budget')
    expect(document.activeElement).toBe(screen.getByRole('main'))

    // A month stepped on the same screen keeps focus on the arrow pressed.
    go('/month')
    fireEvent.click(await screen.findByRole('button', { name: 'Previous month' }))
    const arrow = screen.getByRole('button', { name: 'Previous month' })
    arrow.focus()
    go('/month/2026-08')
    expect(await screen.findByRole('heading', { name: 'August 2026' })).toBeTruthy()
    expect(document.activeElement).toBe(arrow)
  })
})
