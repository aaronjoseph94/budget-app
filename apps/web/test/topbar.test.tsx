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

const crumbs = () => within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getAllByRole('listitem').map((li) => li.textContent)
const search = () => screen.getByRole('button', { name: 'Search or jump to…' })

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
  window.location.hash = ''
})

describe('the top bar (ADR 0011)', () => {
  it('says where the screen sits, with its parent for Ask, the check-in and AI settings', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(crumbs()).toEqual(['Budget', 'Month'])
    const bar = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(bar).getByRole('link', { name: 'Budget' }).getAttribute('href')).toBe('#/month')
    await expectNoAxeViolations()

    go('/ask')
    await screen.findByRole('heading', { name: 'Ask', level: 1 })
    expect(crumbs()).toEqual(['Coach', 'Ask'])
    expect(within(bar).getByRole('link', { name: 'Coach' }).getAttribute('href')).toBe('#/coach')
    go('/coach/checkin')
    await screen.findByRole('heading', { name: 'Your Sunday check-in', level: 1 })
    expect(crumbs()).toEqual(['Coach', 'Check-in'])
    go('/ai')
    await screen.findByRole('heading', { name: 'AI settings', level: 1 })
    expect(crumbs()).toEqual(['Settings', 'AI settings'])
    expect(within(bar).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('#/settings')
  })

  it('opens Help with its search box ready, from the search box, ⌘K and Ctrl+K', async () => {
    go('/review')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'Review', level: 1 })
    expect(search().getAttribute('aria-keyshortcuts')).toBe('Meta+K Control+K')

    fireEvent.click(search())
    const box = await screen.findByRole('searchbox', { name: 'Search help' })
    expect(document.activeElement).toBe(box)
    expect(window.location.hash).toBe('#/help')

    go('/month')
    await screen.findByRole('heading', { name: 'September 2026' })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const again = await screen.findByRole('searchbox', { name: 'Search help' })
    expect(document.activeElement).toBe(again)

    // Already on Help, with focus elsewhere: the box takes it back.
    act(() => screen.getByRole('main').focus())
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search help' }))
  })

  it('leaves ⌘ with another key, and K alone, to the browser', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    fireEvent.keyDown(window, { key: 'k' })
    fireEvent.keyDown(window, { key: 'l', metaKey: true })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, shiftKey: true })
    expect(window.location.hash).toBe('')
  })

  it('offers + Add, and shows from 768px only, where the phone bar has its own Add', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    const header = screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('header')!
    expect(within(header).getByRole('link', { name: 'Add' }).getAttribute('href')).toBe('#/add')
    expect([header.classList.contains('hidden'), header.classList.contains('md:flex')]).toEqual([true, true])
  })

  it('folds the sidebar to the rail from its toggle, and remembers it on this device', async () => {
    const first = renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    const toggle = screen.getByRole('button', { name: 'Toggle sidebar' })
    const aside = screen.getByRole('complementary', { name: 'Sidebar' })
    expect([toggle.getAttribute('aria-expanded'), toggle.getAttribute('aria-controls')]).toEqual(['true', aside.id])
    expect(aside.classList.contains('lg:w-[248px]')).toBe(true)

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(aside.classList.contains('lg:w-[248px]')).toBe(false)
    // Folded, every item keeps its name, and no group folds away.
    expect(within(aside).getByRole('link', { name: 'Month' }).querySelector('span')?.classList.contains('lg:inline')).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(SIDEBAR_KEY) ?? '{}')).toEqual({ folded: true, open: {} })
    first.unmount()

    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(screen.getByRole('button', { name: 'Toggle sidebar' }).getAttribute('aria-expanded')).toBe('false')
  })
})
