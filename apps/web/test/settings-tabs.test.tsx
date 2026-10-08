import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from '../src/screens/SettingsScreen.js'
import { SETTINGS_TAB_HELP } from '../src/help/screen-help.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
    expect(tabs().map((t) => [t.textContent, t.getAttribute('aria-selected')])).toEqual([
      ['Lists', 'false'], ['Budgets & goals', 'true'], ['AI', 'false'], ['Account', 'false'],
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

  it('puts the shops filed by themselves, AI apps and Sign out on Account, and opens Lists at a bare #/settings', async () => {
    renderScreen(<SettingsScreen tab="account" />, createFakeSupabase())
    expect([...panel().querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Shops filed by themselves', 'AI apps', 'Account'])
    // The shops beside AI apps and the account from 1280px; the address and Sign out share one row.
    expect(cardOf('Shops filed by themselves').parentElement?.className).toContain('xl:grid-cols-2')
    expect(within(cardOf('Account')).getByRole('button', { name: 'Sign out' })).toBeTruthy()
    await screen.findByText(/None yet|Learned shops/)
    cleanup()

    renderScreen(<SettingsScreen tab={null} />, createFakeSupabase())
    expect(selected()).toBe('Lists')
    expect(await within(panel()).findByRole('heading', { level: 2, name: 'Bills' })).toBeTruthy()
  })

  it('makes each tab an address, so a refresh and the back gesture land on it', () => {
    renderScreen(<SettingsScreen tab="lists" />, createFakeSupabase())
    fireEvent.click(screen.getByRole('tab', { name: 'Account' }))
    expect(window.location.hash).toBe('#/settings/account')
  })

  it('gives each tab its own article for the ?: Lists, Budgets and bills, Turn on free AI, and AI apps for Account', () => {
    expect(SETTINGS_TAB_HELP).toEqual({ lists: 'lists', budgets: 'budgets', ai: 'free-ai', account: 'ai-apps' })
  })
})
