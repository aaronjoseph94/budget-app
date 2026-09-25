import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { EXAMPLE_TODAY, forecastFake } from './forecast-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** A paragraph whose whole text is `s`, however it is split into spans. */
const para = (s: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === s

beforeAll(() => warmScreen('#/coach', 'Coach'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(EXAMPLE_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('the Coach’s forecast card (plan A13)', () => {
  it('says where the month is heading and what is safe to spend, in the app’s words, and opens the Forecast', async () => {
    go('/coach')
    renderScreen(<Shell />, forecastFake())

    const card = await screen.findByRole('region', { name: 'Forecast' })
    expect(within(card).getByRole('heading', { name: 'Where September is heading' })).toBeTruthy()
    expect(within(card).getByText(para('At this pace, September ends near $3,310. Safe to spend: $502.85 a day.'))).toBeTruthy()
    // The day's outlook, not an insight: never among the three, and never dismissed.
    expect(within(screen.getByRole('region', { name: 'Insights' })).queryByRole('heading', { name: 'Where September is heading' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Dismiss this insight' })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Open the Forecast' }))
    expect(window.location.hash).toBe('#/forecast')
  })

  it('lists the engine’s figures behind it', async () => {
    go('/coach')
    renderScreen(<Shell />, forecastFake())

    const card = await screen.findByRole('region', { name: 'Forecast' })
    fireEvent.click(within(card).getByRole('button', { name: 'Why am I seeing this?' }))
    const sheet = await screen.findByRole('dialog')
    const figure = (label: string) => within(sheet).getByText(label).nextElementSibling?.textContent
    expect(figure('Safe to spend a day')).toBe('$502.85')
    expect(figure('Month’s end, lowest')).toBe('$3,280')
    expect(figure('Tightest day in the next 30')).toBe('8 Oct')
  })

  it('speaks of the Spent alone with no start typed (D17)', async () => {
    go('/coach')
    renderScreen(<Shell />, forecastFake(null))

    const card = await screen.findByRole('region', { name: 'Forecast' })
    expect(
      within(card).getByText(para('At this pace, you’ll spend about $2,390 in September. Type this month’s starting balance to see where you’ll end.')),
    ).toBeTruthy()
  })

  it('leaves the card out, and the rest of the Coach in, when when-you-are-paid cannot be read', async () => {
    const fake = forecastFake()
    fake.fail('pay_schedules', '42P01')
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByRole('region', { name: 'Insights' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Forecast' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
