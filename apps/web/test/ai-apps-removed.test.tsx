import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { readAddress } from '../src/nav.js'
import { SettingsScreen } from '../src/screens/SettingsScreen.js'
import { ReviewScreen } from '../src/screens/ReviewScreen.js'
import { ARTICLES } from '../src/help/articles.js'
import { HELP_TOPICS } from '../src/help/topics.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

/**
 * "Connect an AI app" (a server for Claude, ChatGPT and the like, with its
 * sign-in page, Settings card and Review suggestions) was removed whole: the
 * owner does not use it. These cases hold the removal clean. The owner's own
 * AI helper (provider keys, order, limits, the Coach, Ask, suggested
 * categories) stays, and is checked in its own tests.
 */
// Claude alone is not here: Anthropic is one of the owner's own AI services, named in AI settings.
const GONE = /ai[- ]?apps?\b|chatgpt|connect(?:ing)? (?:to )?claude|oauth|mcp|consent|suggested changes?/i

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
  window.history.replaceState(null, '', '/')
  window.location.hash = ''
})

describe('Settings after the AI apps card was removed', () => {
  it('shows no AI apps card on the AI tab, and the owner’s own AI settings are still there', async () => {
    renderScreen(<SettingsScreen tab="ai" />, createFakeSupabase())
    const panel = await screen.findByRole('tabpanel')
    expect(await within(panel).findByRole('region', { name: 'AI now' })).toBeTruthy()
    expect(within(panel).queryByRole('heading', { name: GONE })).toBeNull()
    expect(panel.textContent).not.toMatch(GONE)
  })

  it('shows no AI apps card on any tab', async () => {
    for (const tab of ['lists', 'budgets', 'ai', 'account'] as const) {
      renderScreen(<SettingsScreen tab={tab} />, createFakeSupabase())
      const panel = await screen.findByRole('tabpanel')
      await waitFor(() => expect(within(panel).queryByText(/^Loading|Checking/)).toBeNull())
      expect(panel.textContent, tab).not.toMatch(GONE)
      expect(within(panel).queryByRole('switch', { name: /connect/i }), tab).toBeNull()
      cleanup()
    }
  })
})

describe('the old consent address', () => {
  it('opens the Month, the app’s normal fallback, with no error', async () => {
    // Where Supabase used to send an AI app's sign-in: a real path, not a #address.
    window.history.replaceState(null, '', '/oauth/consent?authorization_id=a1')
    renderScreen(<Shell />, createFakeSupabase())
    expect(await screen.findByRole('heading', { level: 1, name: /20\d\d/ })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).not.toMatch(GONE)
  })

  it('reads #/consent and #/ai-apps, which no longer exist, as the Month', () => {
    for (const hash of ['#/consent', '#/oauth/consent', '#/ai-apps', '#/settings/ai-apps', '#/help/ai-apps']) {
      expect(readAddress(hash).screen, hash).toBe('month')
    }
  })

  it('opens a remembered #/consent address as the Month through the shell', async () => {
    go('/consent')
    renderScreen(<Shell />, createFakeSupabase())
    expect(await screen.findByRole('heading', { level: 1, name: /20\d\d/ })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Review after suggested changes from AI apps were removed', () => {
  it('has no suggested changes section, with nothing waiting', async () => {
    renderScreen(<ReviewScreen />, createFakeSupabase())
    expect(await screen.findByText('All caught up')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /suggested changes/i })).toBeNull()
    expect(document.body.textContent).not.toMatch(GONE)
  })

  it('never asks the database for AI-app suggestions, when the app loads or Review opens', async () => {
    const fake = createFakeSupabase()
    renderScreen(<ReviewScreen />, fake)
    await screen.findByText('All caught up')
    expect(fake.rpcCalls.filter((c) => /ai_app|suggestion|propos/i.test(c.name) && c.name !== 'suggest_candidate_categories')).toEqual([])
  })
})

describe('Help after the AI apps article was removed', () => {
  it('has no article, topic or word about AI apps, Claude or ChatGPT connecting', () => {
    expect(HELP_TOPICS).not.toContain('ai-apps')
    expect(ARTICLES.map((a) => a.id)).not.toContain('ai-apps')
    for (const a of ARTICLES) {
      const text = [a.title, a.summary, a.done, a.stuck, ...a.steps, ...a.related, ...(a.terms ?? []).flatMap((t) => [t.term, t.meaning])].join(' ')
      expect(text, a.id).not.toMatch(GONE)
    }
  })
})
