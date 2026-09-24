import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Each screen's headings, in order, never skip a level: a screen reader
 * lists them as the screen's outline, and an h3 straight under the h1
 * reads as a part of something that is not there (FE-12, DT-4).
 */
function skips(): string[] {
  const found: string[] = []
  let last = 0
  for (const h of document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')) {
    const level = Number(h.tagName.slice(1))
    if (level > last + 1) found.push(`h${last} then h${level} "${h.textContent ?? ''}"`)
    last = level
  }
  return found
}

const cat = (id: string, name: string, kind: Category['kind']): Category => ({ id, name, kind, sort_order: 0, weekly_budget_cents: 5000 })

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

describe('heading levels', () => {
  it.each([
    // Each with the last heading it draws once everything it reads is in.
    ['week', 'This week', 'Flight training'],
    ['settings', 'Settings', 'Your goal'],
    ['month', 'September 2026', 'Savings'],
    ['savings', 'Savings goals', 'Flight fund'],
  ])('never skip one on %s', async (route, title, last) => {
    act(() => {
      window.location.hash = `#/${route}`
    })
    const fake = createFakeSupabase({
      categories: [cat('c1', 'Groceries', 'variable'), cat('c2', 'Rent', 'bill'), cat('c3', 'Flight fund', 'savings')],
      savings_goals: [{
        id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 100_000, target_date: null,
        unit_cost_cents: null, unit_label: null, category_id: null, start_date: null, balance_as_of: null,
      }],
    })
    renderScreen(<Shell />, fake)
    await screen.findByRole('heading', { level: 1, name: title })
    await screen.findByRole('heading', { name: last })

    expect(skips()).toEqual([])
  })
})
