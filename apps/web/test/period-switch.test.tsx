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

describe('the Month · Week · Pay · Year switch (ADR 0006)', () => {
  it.each([
    ['/month', 'Month', 'September 2026'],
    ['/week', 'Week', 'This week'],
    // No pay schedule in the fake: the switch is there even so.
    ['/paycheck', 'Pay', 'Paycheck'],
    ['/year', 'Year', 'Year'],
  ])('is on %s, with its own view marked', async (hash, current, heading) => {
    go(hash)
    renderScreen(<Shell />, createFakeSupabase())
    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeTruthy()

    const links = (await views()).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Month', '#/month'],
      ['Week', '#/week'],
      ['Pay', '#/paycheck'],
      ['Year', '#/year'],
    ])
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual([current])
    // Mockup A's segmented control: the view showing lifted onto the card,
    // the others in the grey that reads on the canvas (ADR 0010).
    for (const a of links) expect(a.classList.contains(a.textContent === current ? 'bg-card' : 'text-canvas-muted')).toBe(true)
  })

  it('is on no other screen', async () => {
    go('/savings')
    renderScreen(<Shell />, createFakeSupabase())
    await screen.findByRole('heading', { name: 'Savings goals' })
    expect(screen.queryByRole('navigation', { name: 'Views' })).toBeNull()
    await expectNoAxeViolations()
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
