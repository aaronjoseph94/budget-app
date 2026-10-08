import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
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
    // AI settings is Settings' AI tab (ADR 0014 §2): the old address opens it, and the crumb names the tab.
    go('/ai')
    await screen.findByRole('heading', { name: 'Settings', level: 1 })
    await waitFor(() => expect(crumbs()).toEqual(['Settings', 'AI']))
    expect(within(bar).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('#/settings')
    go('/settings/lists')
    await waitFor(() => expect(crumbs()).toEqual(['Settings', 'Lists']))
    // Getting started opens from Help (decision 6), so Help is its parent.
    go('/start')
    await screen.findByRole('heading', { name: 'Getting started', level: 1 })
    expect(crumbs()).toEqual(['Help', 'Getting started'])
    expect(within(bar).getByRole('link', { name: 'Help' }).getAttribute('href')).toBe('#/help')
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

  it('takes ⌘K from the browser, and on a Mac leaves Ctrl+K to the text field it deletes a line in', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15')
    // fireEvent returns false when the handler prevented the default.
    expect(fireEvent.keyDown(window, { key: 'k', ctrlKey: true })).toBe(true)
    expect(window.location.hash).toBe('')
    expect(fireEvent.keyDown(window, { key: 'k', metaKey: true })).toBe(false)
    expect(window.location.hash).toBe('#/help')
  })

  // e2e-setup-09: Ctrl+K in Setup's name field went to Help, and the name typed was lost.
  it('saves a field that saves when left before Ctrl+K or ⌘K leaves its screen, as pressing Search does', async () => {
    const fake = createFakeSupabase()
    await fake.signIn()
    go('/setup')
    renderScreen(<Shell />, fake, 'Sam')
    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'My name is' })
    act(() => field.focus())
    fireEvent.change(field, { target: { value: 'Typing half' } })
    expect(fireEvent.keyDown(field, { key: 'k', ctrlKey: true })).toBe(false)

    expect(await screen.findByRole('searchbox', { name: 'Search help' })).toBe(document.activeElement)
    await vi.waitFor(() => expect(fake.user.user_metadata).toEqual({ display_name: 'Typing half' }))
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
    expect(screen.getByRole('main').parentElement!.parentElement!.classList.contains('lg:pl-[248px]')).toBe(true)

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(aside.classList.contains('lg:w-[248px]')).toBe(false)
    // The panel takes back the sidebar's width, leaving room for the rail only.
    const panel = screen.getByRole('main').parentElement!.parentElement!
    expect([panel.classList.contains('md:pl-[72px]'), panel.classList.contains('lg:pl-[248px]')]).toEqual([true, false])
    // Folded, every item keeps its name, and no group folds away.
    expect(within(aside).getByRole('link', { name: 'Month' }).querySelector('span')?.classList.contains('lg:inline')).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(SIDEBAR_KEY) ?? '{}')).toEqual({ folded: true, open: {} })
    first.unmount()

    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(screen.getByRole('button', { name: 'Toggle sidebar' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('draws the accent focus ring on every control in the sidebar and the top bar (README: focus = --ring)', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    const header = screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('header')!
    const aside = screen.getByRole('complementary', { name: 'Sidebar' })
    const controls = [...aside.querySelectorAll('a, button'), ...header.querySelectorAll('a, button')]
    expect(controls.length).toBeGreaterThan(20)
    const bare = controls.filter((c) => !c.classList.contains('focus-visible:ring-ring')).map((c) => c.getAttribute('aria-label') ?? c.textContent)
    expect(bare).toEqual([])
  })

  it('gives Ask a way back on the page, opens the old AI settings address as Settings › AI, and lights their parents in the sidebar (P1 item 2)', async () => {
    go('/ask')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'Ask', level: 1 })
    const sidebar = screen.getAllByRole('navigation', { name: 'Screens' })[0]!
    expect(within(screen.getByRole('main')).getByRole('link', { name: '← Coach' }).getAttribute('href')).toBe('#/coach')
    expect(within(sidebar).getByRole('link', { name: /^Coach/ }).getAttribute('aria-current')).toBe('page')

    // AI settings is Settings' AI tab (ADR 0014 §2): Settings' one title, the tab chosen, and Settings lit; no title or link of its own.
    go('/ai')
    await screen.findByRole('heading', { name: 'Settings', level: 1 })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('tab', { name: 'AI' }).getAttribute('aria-selected')).toBe('true')
    expect(within(screen.getByRole('main')).queryByRole('link', { name: '← Settings' })).toBeNull()
    expect(within(sidebar).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
    await expectNoAxeViolations()
  })
})
