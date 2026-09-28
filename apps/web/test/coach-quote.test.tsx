import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * The Coach's quote (plan §2.3, §4), from the committed library. With the
 * flight goal and no records there are no cards, so the tags are the goal's:
 * goal, hours, flight. The shortlist, most tags shared first and then the
 * library's order: tasted-flight (3), watch-the-birds and price-it-in-hours
 * (2), then cost-of-a-thing, part-of-all-you-earn and life-energy (1).
 */
const KEY = 'budget.coach.quotes'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

function flight(): FakeSupabase {
  const fake = createFakeSupabase()
  fake.tables.savings_goals.push({
    id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 1_265_000, target_date: null,
    unit_cost_cents: 27_500, unit_label: 'flight time',
  })
  return fake
}

async function quote() {
  return within(await screen.findByRole('region', { name: 'A quote for today' }))
}

/** Wednesday 23 September 2026 is day 20,719 since 1970: 20,719 mod 6 is 1. */
function at(day: number) {
  vi.setSystemTime(new Date(2026, 8, day, 12))
}

beforeAll(() => warmScreen('#/coach', 'Coach'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(23)
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

describe('the Coach’s quote', () => {
  it('shows the day’s pick from the library, its words and who said them, and remembers it on this device', async () => {
    go('/coach')
    renderScreen(<Shell />, flight())

    const card = await quote()
    expect(card.getByText(/^“It is very much the same in learning to ride a flying machine;/)).toBeTruthy()
    expect(card.getByText('Wilbur Wright, Some Aeronautical Experiments (1901), Address to the Western Society of Engineers, Chicago')).toBeTruthy()
    // Remembered in an effect after the card is drawn, so awaited, not assumed.
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(KEY) ?? '{}')).toEqual({ 'watch-the-birds': '2026-09-23' }))
    await expectNoAxeViolations()
  })

  it('never shows what this device showed in the fortnight before, and keeps today’s pick all day', async () => {
    // Without watch-the-birds, the shortlist's second is price-it-in-hours, a tip.
    window.localStorage.setItem(KEY, JSON.stringify({ 'watch-the-birds': '2026-09-20', 'tasted-flight': '2026-09-08' }))
    go('/coach')
    renderScreen(<Shell />, flight())

    const card = await quote()
    expect(card.getByText('A tip')).toBeTruthy()
    expect(card.getByText(/^Before you buy, work out what it costs in hours/)).toBeTruthy()
    expect(card.getByText('Advice from Vicki Robin and Joe Dominguez: Your Money or Your Life (1992)')).toBeTruthy()
    // The 8th is more than a fortnight before, so tasted-flight was not left out, and is forgotten.
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(KEY) ?? '{}')).toEqual({ 'watch-the-birds': '2026-09-20', 'price-it-in-hours': '2026-09-23' }),
    )
  })

  it('keeps showing today’s pick when the Coach is opened again the same day', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ 'watch-the-birds': '2026-09-23' }))
    go('/coach')
    renderScreen(<Shell />, flight())

    expect((await quote()).getByText(/^“It is very much the same/)).toBeTruthy()
  })

  it('says a line only attributed to someone is not found in their writing, and how that is known', async () => {
    // 22 September: 20,718 mod 6 is 0, tasted-flight.
    at(22)
    go('/coach')
    renderScreen(<Shell />, flight())

    const card = await quote()
    expect(card.getByText('Often attributed to Leonardo da Vinci; not found in their own writing.')).toBeTruthy()
    expect(card.getByText(/^Quote Investigator traces it to John H\. Secondari/)).toBeTruthy()
  })

  it('still shows a quote when this device’s storage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    go('/coach')
    renderScreen(<Shell />, flight())

    expect((await quote()).getByText(/^“It is very much the same/)).toBeTruthy()
  })
})
