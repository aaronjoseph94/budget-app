import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * The address bar says what is shown. An address the app cannot read
 * (an unknown screen, a thirteenth month, a Tuesday for a week) opens the
 * first screen, and the address is written over with that screen's own, so
 * a refresh, a bookmark and the address the app reopens at are all true.
 */

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

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

describe('an address the app cannot read', () => {
  it.each(['#/nope', '#/month/2026-13', '#/week/2026-09-22', '#/settings/nope', '#/help/nope', '#/month/9999-12'])(
    'opens the Month for %s, and the address says so',
    async (hash) => {
      window.location.hash = hash
      renderScreen(<Shell />, createFakeSupabase())
      expect(await screen.findByRole('heading', { level: 1, name: 'September 2026' })).toBeTruthy()
      await waitFor(() => expect(window.location.hash).toBe('#/month'))
    },
  )

  it.each(['#/month/2026-08', '#/settings/lists', '#/help/updates'])('leaves %s as it is', async (hash) => {
    window.location.hash = hash
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findAllByRole('navigation', { name: 'Screens' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(window.location.hash).toBe(hash)
  })

  it('leaves the bare address alone', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { level: 1, name: 'September 2026' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(window.location.hash).toBe('')
  })
})
