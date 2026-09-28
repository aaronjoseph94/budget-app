import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

/** The Coach tab's dot (plan §2.1, §2.4, A20): from Sunday until the week's check-in is opened on this device. */
function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const phoneBar = () => screen.getAllByRole('navigation', { name: 'Screens' })[1]!
const coachTab = () => within(phoneBar()).getByRole('link', { name: /^Coach/ })
const on = (day: number) => vi.setSystemTime(new Date(2026, 8, day, 12))

// The Coach is the lazy screen these tests open cold, and under load its
// first render lost a find's one second (N87).
beforeAll(() => warmScreen('#/coach', 'Coach'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
  window.localStorage.clear()
})

describe('the Coach tab’s dot', () => {
  it('shows from Sunday, says so in words, and goes once the check-in is opened', async () => {
    on(27)
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(coachTab().getAttribute('aria-label')).toBe('Coach, check-in ready')
    expect(coachTab().querySelector('span.rounded-full.bg-primary')).not.toBeNull()

    go('/coach')
    const card = await screen.findByRole('link', { name: /^Your Sunday check-in is ready/ })
    expect(card.getAttribute('href')).toBe('#/coach/checkin')
    expect(within(card).getByText('The week of 21 – 27 Sep')).toBeTruthy()
    // On the Coach itself the card says it, not the tab.
    expect(coachTab().getAttribute('aria-label')).toBe('Coach')

    go('/coach/checkin')
    await screen.findByRole('heading', { name: 'Your Sunday check-in', level: 1 })
    go('/month')
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(coachTab().getAttribute('aria-label')).toBe('Coach')
    expect(coachTab().querySelector('span.rounded-full.bg-primary')).toBeNull()
    go('/coach')
    expect(await screen.findByRole('link', { name: /^Your weekly check-in/ })).toBeTruthy()
  })

  it('stays gone for the rest of the week, and comes back next Sunday', async () => {
    window.localStorage.setItem('budget.coach.checkin.seen', '2026-09-21')
    on(30)
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(coachTab().getAttribute('aria-label')).toBe('Coach')
    cleanup()

    vi.setSystemTime(new Date(2026, 9, 4, 12))
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'October 2026' })
    expect(coachTab().getAttribute('aria-label')).toBe('Coach, check-in ready')
  })
})
