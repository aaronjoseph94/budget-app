import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * The tab's title names the screen shown. Signed out there is no screen:
 * the sign-in page takes the app's place, and the title goes back to the
 * app's own name rather than keep the last screen's.
 */
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

describe('the tab title', () => {
  it('names the screen while the app is shown, and only the app once it is gone', async () => {
    window.location.hash = '#/settings/account'
    const view = renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { level: 1, name: 'Settings' })
    expect(document.title).toBe('Settings · Budget')

    // Signing out takes the Shell away; the sign-in page is drawn in its place.
    view.unmount()
    expect(document.title).toBe('Budget')
  })
})
