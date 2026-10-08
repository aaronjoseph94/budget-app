import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { SettingsScreen } from '../src/screens/SettingsScreen.js'
import { SETTINGS_TAB_HELP } from '../src/help/screen-help.js'
import { articleFor } from '../src/help/articles.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeAll(() => warmScreen('#/settings', 'Settings'))

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.location.hash = ''
})

const tabs = () => within(screen.getByRole('tablist', { name: 'Settings' })).getAllByRole('tab')
const selected = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')?.textContent
const panel = () => screen.getByRole('tabpanel')
const cardOf = (title: string) => screen.getByRole('heading', { level: 2, name: title }).parentElement!

describe('Settings, one screen with four tabs (ADR 0014 §2)', () => {
  it('reads Lists · Budgets & goals · AI · Account, with the tab in the address selected and its panel under it', async () => {
    renderScreen(<SettingsScreen tab="budgets" />, createFakeSupabase())

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    // One tab stop, the chosen one; the arrows reach the rest.
    expect(tabs().map((t) => [t.textContent, t.getAttribute('aria-selected'), t.tabIndex])).toEqual([
      ['Lists', 'false', -1], ['Budgets & goals', 'true', 0], ['AI', 'false', -1], ['Account', 'false', -1],
    ])
    expect(panel().getAttribute('aria-labelledby')).toBe(tabs()[1]?.id)
    expect([...panel().querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Weekly budgets', 'Your savings goals'])
    // Mockup A: the budgets beside the goals from 1280px.
    expect(cardOf('Weekly budgets').parentElement?.className).toContain('xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]')
    // The cards that only linked elsewhere are gone, and so is the lede: the tabs say what is here.
    expect(screen.queryByRole('button', { name: /^Open (Setup|AI settings|Getting started)/ })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).nextElementSibling?.tagName).not.toBe('P')
    await screen.findByText(/None yet/)
    await expectNoAxeViolations()
  })

  it('puts the shops filed by themselves, AI apps and Sign out on Account', async () => {
    renderScreen(<SettingsScreen tab="account" />, createFakeSupabase())
    expect([...panel().querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Shops filed by themselves', 'AI apps', 'Account'])
    // The shops beside AI apps and the account from 1280px; the address and Sign out share one row.
    expect(cardOf('Shops filed by themselves').parentElement?.className).toContain('xl:grid-cols-2')
    expect(within(cardOf('Account')).getByRole('button', { name: 'Sign out' })).toBeTruthy()
    await screen.findByText(/None yet|Learned shops/)
  })

  it('draws AI settings as the AI tab, under Settings’ own title', async () => {
    renderScreen(<SettingsScreen tab="ai" />, createFakeSupabase())
    expect(await within(panel()).findByRole('region', { name: 'AI now' })).toBeTruthy()
    expect(await within(panel()).findByRole('region', { name: 'How the Coach talks' })).toBeTruthy()
    // AI settings' own title row and its "← Settings" are hidden by their place in the wrapper (AiTab.tsx).
    expect(within(panel()).getByRole('heading', { level: 1, name: 'AI settings' })).toBeTruthy()
    expect(panel().firstElementChild?.className).toContain('[&>div>div:has(>h1)]:hidden')
  })

  it('chooses with the arrow keys, Home and End, wrapping at the ends, and each choice is an address', () => {
    renderScreen(<SettingsScreen tab="lists" />, createFakeSupabase())
    const [lists, budgets, , account] = tabs()
    lists?.focus()
    fireEvent.keyDown(lists!, { key: 'ArrowRight' })
    expect(window.location.hash).toBe('#/settings/budgets')
    expect(document.activeElement).toBe(budgets)
    fireEvent.keyDown(lists!, { key: 'ArrowLeft' })
    expect(window.location.hash).toBe('#/settings/account')
    expect(document.activeElement).toBe(account)
    fireEvent.keyDown(lists!, { key: 'End' })
    expect(window.location.hash).toBe('#/settings/account')
    fireEvent.keyDown(lists!, { key: 'Home' })
    expect(window.location.hash).toBe('#/settings/lists')
    fireEvent.click(budgets!)
    expect(window.location.hash).toBe('#/settings/budgets')
  })

  it('opens Lists at a bare #/settings until a tab has been seen, then the last one seen on this device', async () => {
    renderScreen(<SettingsScreen tab={null} />, createFakeSupabase())
    expect(selected()).toBe('Lists')
    expect(await within(panel()).findByRole('heading', { level: 2, name: 'Bills' })).toBeTruthy()
    cleanup()
    window.localStorage.setItem('budget.settings.tab', 'account')
    renderScreen(<SettingsScreen tab={null} />, createFakeSupabase())
    expect(selected()).toBe('Account')
  })

  it('still opens, on Lists, when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'QuotaExceededError')
    })
    renderScreen(<SettingsScreen tab="ai" />, createFakeSupabase())
    cleanup()
    renderScreen(<SettingsScreen tab={null} />, createFakeSupabase())
    expect(selected()).toBe('Lists')
  })

  it('gives each tab its own article for the ?: Lists, Budgets and bills, Turn on free AI, and AI apps for Account', () => {
    expect(SETTINGS_TAB_HELP).toEqual({ lists: 'lists', budgets: 'budgets', ai: 'free-ai', account: 'ai-apps' })
  })
})

describe('Settings through the shell', () => {
  it('follows the address: the panel changes with the tab, the tab seen is remembered, and ? opens that tab’s article', async () => {
    go('/settings/account')
    renderScreen(<Shell />, createFakeSupabase())
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    expect(selected()).toBe('Account')
    expect(within(panel()).getByRole('button', { name: 'Sign out' })).toBeTruthy()
    // Remembered once the screen has settled, not as it is drawn.
    await waitFor(() => expect(window.localStorage.getItem('budget.settings.tab')).toBe('account'))
    expect(document.title).toBe('Settings · Budget')

    fireEvent.click(screen.getByRole('tab', { name: 'Budgets & goals' }))
    expect(window.location.hash).toBe('#/settings/budgets')
    go('/settings/budgets')
    expect(await within(panel()).findByRole('heading', { level: 2, name: 'Weekly budgets' })).toBeTruthy()
    expect(selected()).toBe('Budgets & goals')
    await waitFor(() => expect(window.localStorage.getItem('budget.settings.tab')).toBe('budgets'))

    fireEvent.click(screen.getByRole('button', { name: 'Help with this screen' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('heading', { level: 2 }).textContent).toBe(articleFor(SETTINGS_TAB_HELP.budgets)?.title)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))

    // The sidebar's Settings is the bare address: it opens where the owner left it.
    go('/settings')
    expect(await within(panel()).findByRole('heading', { level: 2, name: 'Weekly budgets' })).toBeTruthy()
    expect(selected()).toBe('Budgets & goals')
  })

  it('opens #/ai, the old address, as Settings › AI', async () => {
    go('/ai')
    renderScreen(<Shell />, createFakeSupabase())
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    expect(selected()).toBe('AI')
    expect(await within(panel()).findByRole('region', { name: 'AI now' })).toBeTruthy()
  })
})
