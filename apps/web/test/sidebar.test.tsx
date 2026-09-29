import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
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

describe('the sidebar (ADR 0011)', () => {
  it('lights the item for the screen showing', async () => {
    go('/savings')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'Savings goals' })
    expect(within(sidebar()).getByRole('link', { name: 'Savings' }).getAttribute('aria-current')).toBe('page')
    await expectNoAxeViolations()

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
})
