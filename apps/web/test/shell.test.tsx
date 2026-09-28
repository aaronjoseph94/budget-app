import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { MORE_GROUPS } from '../src/screens/MoreScreen.js'
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
const deskBar = () => screen.getAllByRole('navigation', { name: 'Screens' })[0]!
/** An item in one of More's groups, once More is showing. */
const moreItem = async (group: string, name: string) =>
  within(await screen.findByRole('region', { name: group })).getByRole('link', { name: new RegExp(`^${name}`) })

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

// jsdom does not follow a link's hash when it is clicked, so these check
// the address each link names and then go there, as the browser would.
describe('Shell', () => {
  it('opens on this month, with Month, Coach, Add, Review and More on the phone bar (ADR 0006)', async () => {
    renderScreen(<Shell />, createFakeSupabase())

    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
    const labels = within(phoneBar()).getAllByRole('link').map((b) => b.textContent)
    expect(labels).toEqual(['Month', 'Coach', 'Add', 'Review', 'More'])
    expect(within(phoneBar()).getByRole('link', { name: 'Month' }).getAttribute('aria-current')).toBe('page')
  })

  it('gives every tab on the desktop bar an icon of its own', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })

    const desk = screen.getAllByRole('navigation', { name: 'Screens' })[0]!
    const drawn = within(desk).getAllByRole('link').map((b) => b.querySelector('svg')?.innerHTML)
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

  it('puts the Coach on the wide bar beside the views, and Paycheck, Year, the Bill calendar and Setup elsewhere', async () => {
    go('/coach')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'Coach', level: 1 })

    expect(within(deskBar()).getAllByRole('link').map((b) => b.textContent)).toEqual([
      'Month', 'Week', 'Coach', 'Forecast', 'Reports', 'Savings', 'Debts', 'Review', 'Add', 'More',
    ])
    expect(within(deskBar()).getByRole('link', { name: 'Coach' }).getAttribute('aria-current')).toBe('page')
    expect(within(phoneBar()).getByRole('link', { name: 'Coach' }).getAttribute('aria-current')).toBe('page')
  })

  it('lights the Month on a phone for a view reached through its switch, and the Week on a wide screen', async () => {
    go('/week')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'This week' })
    expect(within(phoneBar()).getByRole('link', { name: 'Month' }).getAttribute('aria-current')).toBe('page')
    expect(within(deskBar()).getByRole('link', { name: 'Week' }).getAttribute('aria-current')).toBe('page')
  })

  it('groups More by what it is for, lists only what is built, and lights More while its screens show', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    expect(within(phoneBar()).getByRole('link', { name: 'More' }).getAttribute('href')).toBe('#/more')
    go('/more')

    await screen.findByRole('heading', { name: 'More' })
    const groups = screen.getAllByRole('region').map((g) => [
      within(g).getByRole('heading').textContent,
      within(g).getAllByRole('listitem').map((li) => li.querySelector('.font-medium')?.textContent),
    ])
    expect(groups).toEqual([
      ['Plan', ['Paycheck', 'Bill calendar', 'Year', 'Savings', 'Debts', 'Forecast']],
      ['Understand', ['Reports', 'Ask']],
      ['Set up and help', ['Getting started', 'Setup', 'AI settings', 'Settings', 'Help']],
      ['Records', ['All transactions']],
    ])
    expect(MORE_GROUPS.map((g) => [g.title, g.items.map((i) => i.label)])).toEqual([
      ['Plan', ['Paycheck', 'Bill calendar', 'Year', 'Savings', 'Debts', 'Forecast']],
      ['Understand', ['Reports', 'Ask']],
      ['Set up and help', ['Getting started', 'Setup', 'AI settings', 'Settings', 'Help']],
      ['Records', ['All transactions']],
    ])

    expect((await moreItem('Records', 'All transactions')).getAttribute('href')).toBe('#/ledger')
    go('/ledger')
    expect(within(phoneBar()).getByRole('link', { name: 'More' }).getAttribute('aria-current')).toBe('page')
  })

  it('opens the Year, fetched on first use, from More, and lights the Month while it shows', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    go('/more')
    expect((await moreItem('Plan', 'Year')).getAttribute('href')).toBe('#/year')
    go('/year')
    expect(await screen.findByRole('heading', { name: 'Year' })).toBeTruthy()
    expect(within(phoneBar()).getByRole('link', { name: 'Month' }).getAttribute('aria-current')).toBe('page')
    expect(within(deskBar()).getByRole('link', { name: 'Month' }).getAttribute('aria-current')).toBe('page')
  })

  it('opens Savings from More on a phone, and from the bar on a desktop', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    go('/more')
    expect((await moreItem('Plan', 'Savings')).getAttribute('href')).toBe('#/savings')
    go('/savings')
    expect(await screen.findByRole('heading', { name: 'Savings goals' })).toBeTruthy()
    expect(within(deskBar()).getByRole('link', { name: 'Savings' }).getAttribute('aria-current')).toBe('page')
    expect(within(phoneBar()).getByRole('link', { name: 'More' }).getAttribute('aria-current')).toBe('page')
  })

  it('opens Debts from More on a phone, and from the bar on a desktop', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    go('/more')
    expect((await moreItem('Plan', 'Debts')).getAttribute('href')).toBe('#/debts')
    go('/debts')
    expect(await screen.findByRole('heading', { name: 'Debt payoff' })).toBeTruthy()
    expect(within(deskBar()).getByRole('link', { name: 'Debts' }).getAttribute('aria-current')).toBe('page')
    expect(within(phoneBar()).getByRole('link', { name: 'More' }).getAttribute('aria-current')).toBe('page')
  })

  it('opens the Bill calendar from More, at this month, and lights More while it shows', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    go('/more')
    expect((await moreItem('Plan', 'Bill calendar')).getAttribute('href')).toBe('#/calendar')
    go('/calendar')
    // Fetched on first use now (PERF-3), so its heading is waited for too.
    expect(await screen.findByText('Bill calendar')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
    expect(within(deskBar()).getByRole('link', { name: 'More' }).getAttribute('aria-current')).toBe('page')
    expect(within(phoneBar()).getByRole('link', { name: 'More' }).getAttribute('aria-current')).toBe('page')
  })

  it('shows the review count on the Review tab', async () => {
    const fake = createFakeSupabase({
      ingest_candidates: [
        { id: 'p1', posted_on: '2026-09-10', amount_cents: -1349, merchant: 'LITWARE COFFEE', merchant_raw: 'LITWARE COFFEE', status: 'pending' },
      ],
    })
    renderScreen(<Shell />, fake)
    expect(await within(phoneBar()).findByRole('link', { name: 'Review, 1 waiting' })).toBeTruthy()
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

describe('Shell, reading out what an action did (FE-16)', () => {
  it('keeps one polite status region from the start, and writes a success message into it', async () => {
    const fake = createFakeSupabase({
      categories: [{ id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }],
      ingest_candidates: [
        { id: 'p1', posted_on: '2026-09-09', amount_cents: -1349, merchant: 'LITWARE COFFEE', merchant_raw: 'LITWARE COFFEE', status: 'pending' },
      ],
    })
    go('/review')
    renderScreen(<Shell />, fake)
    // There before any message, so a message written into it is announced;
    // a region that arrives already holding its words often is not.
    const region = screen.getByTestId('announcer')
    expect([region.getAttribute('role'), region.getAttribute('aria-live'), region.textContent]).toEqual(['status', 'polite', ''])

    fireEvent.change(await screen.findByRole('combobox', { name: 'Category' }), { target: { value: 'c1' } })
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }))
    await waitFor(() => expect(region.textContent).toMatch(/^Added\. Future charges from this merchant/))
    expect(screen.getByTestId('announcer')).toBe(region)
  })
})

describe('Shell, its screens as links (FE-20)', () => {
  it('gives every tab and every More item the address it opens, so it can be opened in a new tab', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(within(phoneBar()).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '#/month', '#/coach', '#/add', '#/review', '#/more',
    ])
    expect(within(deskBar()).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '#/month', '#/week', '#/coach', '#/forecast', '#/reports', '#/savings', '#/debts', '#/review', '#/add', '#/more',
    ])

    go('/more')
    expect((await moreItem('Plan', 'Bill calendar')).getAttribute('href')).toBe('#/calendar')
  })
})

describe('Shell, Getting started (plan §8.1, A25)', () => {
  it('opens at its own address, fetched on first use, and names it in the title', async () => {
    go('/start')
    renderScreen(<Shell />, createFakeSupabase())

    expect(await screen.findByRole('heading', { name: 'Getting started' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Your name' })).toBeTruthy()
    expect(document.title).toBe('Getting started · Budget')
    expect(within(phoneBar()).getByRole('link', { name: 'More' }).getAttribute('aria-current')).toBe('page')
  })
})
