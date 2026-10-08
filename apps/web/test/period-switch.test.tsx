import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
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

const views = async () => within(await screen.findByRole('navigation', { name: 'Views' }))

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

describe('the Week · Month · Year switch (ADR 0014)', () => {
  it.each([
    ['/week', 'Week', 'This week'],
    ['/month', 'Month', 'September 2026'],
    ['/year', 'Year', 'Year'],
  ])('is on %s, with its own view marked, shortest period first', async (hash, current, heading) => {
    go(hash)
    renderScreen(<Shell />, createFakeSupabase())
    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeTruthy()

    const links = (await views()).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Week', '#/week'],
      ['Month', '#/month'],
      ['Year', '#/year'],
    ])
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual([current])
    // Mockup A's segmented control: the view showing lifted onto the card,
    // the others in the grey that reads on the canvas (ADR 0010).
    for (const a of links) expect(a.classList.contains(a.textContent === current ? 'bg-card' : 'text-canvas-muted')).toBe(true)
  })

  // e2e-plan-11: with 14 px a side, "Month" made each segment 72 px, and at
  // 320 px the row was 12 px wider than its box, "Year" under the edge
  // fade. Below 640 px each takes 8 px a side: four of 64 px, the gaps and
  // the padding are 284 of the 296 px there. jsdom has no layout, so the
  // classes that give it are what is checked.
  it('keeps all three in view on a 320 px phone, 8 px a side below 640 px', async () => {
    go('/month')
    renderScreen(<Shell />, createFakeSupabase())
    for (const a of (await views()).getAllByRole('link')) {
      expect([a.classList.contains('px-2'), a.classList.contains('px-3.5'), a.classList.contains('sm:px-3.5'), a.classList.contains('min-w-16')]).toEqual([true, false, true, true])
    }
  })

  // The design review's Accessibility list: the Views switch takes the arrow
  // keys as the Add screen's tabs do, wrapping at each end, with Home and End.
  it('moves along the three with the arrow keys, Home and End', async () => {
    go('/month')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'September 2026', level: 1 })
    const [week, month, year] = (await views()).getAllByRole('link')

    week!.focus()
    fireEvent.keyDown(week!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(month)
    fireEvent.keyDown(month!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(week)
    fireEvent.keyDown(week!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(year)
    fireEvent.keyDown(year!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(week)
    fireEvent.keyDown(week!, { key: 'End' })
    expect(document.activeElement).toBe(year)
    fireEvent.keyDown(year!, { key: 'Home' })
    expect(document.activeElement).toBe(week)
    // Focus only moves; the hash is the Month's until a link is followed.
    expect(window.location.hash).toBe('#/month')
  })

  it('is on no other screen', async () => {
    go('/savings')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'Savings goals' })
    expect(screen.queryByRole('navigation', { name: 'Views' })).toBeNull()
    await expectNoAxeViolations()
  })

  // Decision 1 (2026-10-08): Paycheck is its own screen under Plan, beside
  // the Bill calendar, so it stops competing with the three everyday views.
  it('is not on Paycheck, which keeps its screen and its address', async () => {
    go('/paycheck')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'Paycheck', level: 1 })
    expect(screen.queryByRole('navigation', { name: 'Views' })).toBeNull()
  })

  it('puts the Week one tap from the Month, which still opens first', async () => {
    renderScreen(<Shell />, createFakeSupabase())
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()

    go((await views()).getByRole('link', { name: 'Week' }).getAttribute('href')!.slice(1))
    expect(await screen.findByRole('heading', { name: 'This week' })).toBeTruthy()
  })
})

describe('the Month header', () => {
  it('opens the Bill calendar at the month showing', async () => {
    go('/month/2026-08')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'August 2026' })

    fireEvent.click(screen.getByRole('button', { name: 'Bill calendar' }))
    expect(window.location.hash).toBe('#/calendar/2026-08')
  })

  it('names the month between its arrows, with the ? beside the title', async () => {
    go('/month/2026-08')
    renderScreen(<Shell />, createFakeSupabase())
    const title = await screen.findByRole('heading', { name: 'August 2026', level: 1 })

    expect(within(title.parentElement!).getByRole('button', { name: 'Help with this screen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous month' }).nextElementSibling?.textContent).toBe('Aug 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(window.location.hash).toBe('#/month/2026-09')
    await expectNoAxeViolations()
  })
})
