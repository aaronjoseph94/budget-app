import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { articleFor } from '../src/help/articles.js'
import { SCREEN_HELP } from '../src/help/screen-help.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 23, 12))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

const pay: Category = { id: 'c1', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null }

/** Opens the ? on the screen at `hash` and checks it holds `screen`'s article. */
async function opensItsArticle(hash: string, name: keyof typeof SCREEN_HELP, title: string | RegExp) {
  go(hash)
  await screen.findByRole('heading', { level: 1, name: title })
  fireEvent.click(screen.getByRole('button', { name: 'Help with this screen' }))
  const sheet = await screen.findByRole('dialog')
  const article = articleFor(SCREEN_HELP[name])
  expect(within(sheet).getByRole('heading', { level: 2 }).textContent, hash).toBe(article?.title)
  expect(within(sheet).getAllByRole('listitem')).toHaveLength(article?.steps.length ?? -1)
  expect(within(sheet).getByRole('link', { name: 'Show me' }).getAttribute('href')).toBe(`#/help/${SCREEN_HELP[name]}`)
  fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  // Focus goes back to the ? that opened it.
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Help with this screen')
}

describe('the ? beside every screen’s title', () => {
  it.each([
    ['/month', 'month', 'September 2026'],
    ['/week', 'week', 'This week'],
    ['/paycheck', 'paycheck', 'Paycheck'],
    ['/year', 'year', 'Year'],
    ['/calendar', 'calendar', 'September 2026'],
    ['/review', 'review', 'Review'],
    ['/add', 'add', 'Add'],
    ['/more', 'more', 'More'],
    ['/setup', 'setup', 'Settings'],
    ['/settings/lists', 'settings', 'Settings'],
    ['/ledger', 'ledger', 'All transactions'],
    ['/savings', 'savings', 'Savings goals'],
    ['/debts', 'debts', 'Debt payoff'],
    ['/coach', 'coach', 'Coach'],
  ] as const)('on %s opens its article in a sheet, with Show me for the whole of it', async (hash, name, title) => {
    renderScreen(<Shell />, createFakeSupabase())
    await opensItsArticle(hash, name, title)
  })

  it('is beside a pay period’s title as well as the Paycheck’s first step', async () => {
    renderScreen(
      <Shell />,
      createFakeSupabase({ categories: [pay], pay_schedules: [{ id: 's1', category_id: 'c1', first_pay_date: '2026-09-11', frequency: 'biweekly' }] }),
    )
    await opensItsArticle('/paycheck', 'paycheck', 'This pay period')
    await expectNoAxeViolations()
  })
})
