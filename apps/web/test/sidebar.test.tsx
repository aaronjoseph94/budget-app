import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { SIDEBAR_KEY } from '../src/shell/sidebar-state.js'
import { SIGNED_OUT_HERE_ONLY } from '../src/supabase.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const sidebar = () => screen.getAllByRole('navigation', { name: 'Screens' })[0]!
const phoneBar = () => screen.getAllByRole('navigation', { name: 'Screens' })[1]!
const fold = (name: string) => within(sidebar()).getByRole('button', { name: new RegExp(`^${name}`) })
/** The list a group's button opens and closes. */
const listOf = (button: HTMLElement) => document.getElementById(button.getAttribute('aria-controls') ?? '')!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.location.hash = ''
})

describe('the sidebar (ADR 0011)', () => {
  it('lights the item for the screen showing', async () => {
    go('/savings')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'Savings goals' })
    expect(within(sidebar()).getByRole('link', { name: 'Savings' }).getAttribute('aria-current')).toBe('page')
    await expectNoAxeViolations()

  })

  it('keeps Plan open, and folds the other groups, opening the one that holds the screen showing', async () => {
    go('/savings')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'Savings goals' })

    expect(within(sidebar()).queryByRole('button', { name: 'Plan' })).toBeNull()
    expect(['Money', 'Coach', 'Inbox', 'Setup'].map((g) => fold(g).getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false', 'false'])
    // Closed, a list is hidden in the full sidebar only; the rail shows every item.
    expect(listOf(fold('Coach')).classList.contains('lg:hidden')).toBe(true)
    expect(listOf(fold('Money')).classList.contains('lg:hidden')).toBe(false)
    expect(within(sidebar()).getByRole('link', { name: 'Savings' }).getAttribute('aria-current')).toBe('page')
    await expectNoAxeViolations()
  })

  it('remembers which groups the owner opened and closed on this device', async () => {
    const first = renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    fireEvent.click(fold('Setup'))
    fireEvent.click(fold('Money'))
    fireEvent.click(fold('Money'))
    expect(fold('Setup').getAttribute('aria-expanded')).toBe('true')
    expect(JSON.parse(window.localStorage.getItem(SIDEBAR_KEY) ?? '{}')).toEqual({ folded: false, open: { Setup: true, Money: false } })
    first.unmount()

    // Opened again, even on a screen in Money, as the owner left them.
    go('/debts')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'Debt payoff' })
    expect(fold('Setup').getAttribute('aria-expanded')).toBe('true')
    expect(fold('Money').getAttribute('aria-expanded')).toBe('false')
  })

  it('still opens and closes its groups when the browser refuses storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'QuotaExceededError')
    })
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    fireEvent.click(fold('Coach'))
    expect(fold('Coach').getAttribute('aria-expanded')).toBe('true')
  })

  it('names every item for the 72px rail, where only its icon shows', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    const links = within(sidebar()).getAllByRole('link')
    expect(links).toHaveLength(16)
    for (const link of links) {
      expect(link.getAttribute('aria-label')?.startsWith(link.getAttribute('title') ?? '-')).toBe(true)
      expect(link.querySelector('svg')).toBeTruthy()
      // The word beside it shows in the full sidebar only.
      expect(link.querySelector('span')?.classList.contains('lg:inline')).toBe(true)
    }
  })

  it('carries the Review count in waiting’s amber, and on Inbox’s own button while Inbox is closed', async () => {
    const fake = createFakeSupabase({
      ingest_candidates: [
        { id: 'p1', posted_on: '2026-09-10', amount_cents: -1349, merchant: 'LITWARE COFFEE', merchant_raw: 'LITWARE COFFEE', status: 'pending' },
      ],
    })
    renderScreen(<Shell />, fake)
    const review = await within(sidebar()).findByRole('link', { name: 'Review, 1 waiting' })
    expect(review.textContent).toBe('Review1')
    expect(within(review).getByText('1').classList.contains('text-waiting-ink')).toBe(true)
    expect(fold('Inbox').getAttribute('aria-label')).toBe('Inbox, 1 waiting')
    fireEvent.click(fold('Inbox'))
    expect(fold('Inbox').getAttribute('aria-label')).toBeNull()
  })
})

describe('the sidebar’s foot (ADR 0011)', () => {
  const wide = () => vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }))
  const withGoal = () => {
    const fake = createFakeSupabase()
    fake.tables.categories.push({ id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push({ id: 't9', posted_on: '2026-03-05', amount_cents: -20_000, merchant_raw: 'TO FLIGHT FUND', category_id: 'c4', source: 'typed' })
    fake.tables.savings_goals.push({
      id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 845_000, target_date: null,
      unit_cost_cents: 27_500, unit_label: 'flight time', category_id: 'c4', start_date: null, balance_as_of: '2026-03-01',
    })
    return fake
  }

  // Hand-derived: 8,450.00 typed at the end of 1 March and 200.00 moved in
  // on the 5th is 8,650.00 (D16), as the Week and Savings say; 8,650 of
  // 30,000 is 28.8%, shown as 29%.
  it('shows the main goal from 1024px, with its fund’s balance, linking to Savings', async () => {
    wide()
    renderScreen(<Shell />, withGoal())
    const card = (await within(screen.getByRole('complementary', { name: 'Sidebar' })).findByText('$8,650.00 of $30,000.00')).closest('a')!
    expect(card.parentElement?.tagName).toBe('ASIDE')
    expect(within(card).getByText('Flight training')).toBeTruthy()
    expect(within(card).getByText('29%')).toBeTruthy()
    expect(card.getAttribute('href')).toBe('#/savings')
    // The bar is core's 2,883 basis points, drawn as they are.
    expect((card.querySelector('[role="presentation"] > div') as HTMLElement).style.width).toBe('28.83%')
    await expectNoAxeViolations()
  })

  it('leaves the goal out when the sidebar is folded to the rail', async () => {
    wide()
    window.localStorage.setItem(SIDEBAR_KEY, JSON.stringify({ folded: true, open: {} }))
    renderScreen(<Shell />, withGoal())
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(screen.getByRole('complementary', { name: 'Sidebar' }).textContent).not.toContain('Flight training')
  })

  it('reads no goal on a narrower screen, where the rail has no room for it', async () => {
    renderScreen(<Shell />, withGoal())
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(screen.getByRole('complementary', { name: 'Sidebar' }).textContent).not.toContain('Flight training')
  })

  it('names the owner, and signs out', async () => {
    const fake = createFakeSupabase()
    const signOut = vi.spyOn(fake.client.auth, 'signOut')
    renderScreen(<Shell />, fake, 'Sam')
    await screen.findByRole('heading', { name: 'September 2026' })
    const aside = within(screen.getByRole('complementary', { name: 'Sidebar' }))
    expect(aside.getByText('Sam')).toBeTruthy()
    expect(aside.getByText('you@example.com')).toBeTruthy()
    expect(aside.getByText('S').getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(aside.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('signs out on this device even when the server cannot be reached, and says so (security-a-06)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'a-public-anon-key-of-some-length')
    const key = 'sb-abcdefghijklmnopqrst-auth-token'
    window.localStorage.setItem(key, '{"refresh_token":"still-live"}')
    const fake = createFakeSupabase()
    vi.spyOn(fake.client.auth, 'signOut').mockResolvedValue({ error: new Error('Failed to fetch') } as never)
    renderScreen(<Shell />, fake)
    await screen.findByRole('heading', { name: 'September 2026' })
    const aside = within(screen.getByRole('complementary', { name: 'Sidebar' }))
    fireEvent.click(aside.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(window.sessionStorage.getItem(SIGNED_OUT_HERE_ONLY)).toBe('1'))
    expect(window.localStorage.getItem(key)).toBeNull()
    window.sessionStorage.removeItem(SIGNED_OUT_HERE_ONLY)
    vi.unstubAllEnvs()
  })
})

describe('below 768px', () => {
  it('keeps the phone bar as it was, and hides the sidebar there', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(within(phoneBar()).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Month', '#/month'], ['Coach', '#/coach'], ['Add', '#/add'], ['Review', '#/review'], ['More', '#/more'],
    ])
    expect(phoneBar().classList.contains('md:hidden')).toBe(true)
    const aside = screen.getByRole('complementary', { name: 'Sidebar' })
    expect([aside.classList.contains('hidden'), aside.classList.contains('md:flex')]).toEqual([true, true])
  })
})
