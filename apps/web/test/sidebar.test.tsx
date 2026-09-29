import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { SIDEBAR_KEY } from '../src/shell/sidebar-state.js'
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
    expect(JSON.parse(window.localStorage.getItem(SIDEBAR_KEY) ?? '{}')).toEqual({ open: { Setup: true, Money: false } })
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
