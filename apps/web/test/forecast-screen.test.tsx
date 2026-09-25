import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { EXAMPLE_TODAY, forecastFake } from './forecast-seed.js'
import { renderScreen } from './render-screen.js'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** An element whose whole text is `s`, however it is split into spans. */
const whole = (tag: string, s: string) => (_: string, el: Element | null) => el?.tagName === tag && el.textContent === s

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

describe('the Forecast (plan §2.5, A13)', () => {
  it('leads with the sentence and safe to spend, in the app’s words with no AI helper, and asks the AI nothing', async () => {
    const fake = forecastFake()
    fake.functions.ai = null
    go('/forecast')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('P', 'At this pace, September ends near $3,310. Safe to spend: $502.85 a day.'))).toBeTruthy()
    const safe = screen.getByRole('heading', { name: 'Safe to spend' }).closest('div.rounded-xl') as HTMLElement
    expect(within(safe).getByText(whole('P', '$502.85 a day for 7 days, today included'))).toBeTruthy()
    expect(fake.functions.calls).toEqual([])
    expect(document.title).toBe('Forecast · Budget')
  })

  it('asks for this month’s start rather than a daily figure without one (D17)', async () => {
    go('/forecast')
    renderScreen(<Shell />, forecastFake(null))

    const safe = (await screen.findByRole('heading', { name: 'Safe to spend' })).closest('div.rounded-xl') as HTMLElement
    expect(within(safe).getByText('Type this month’s starting balance to see where you’ll end.')).toBeTruthy()
    expect(within(safe).getByRole('link', { name: 'Open the Month' }).getAttribute('href')).toBe('#/month')
  })

  it('says it needs a one-time update, pointing to Help, when when-you-are-paid is not there yet', async () => {
    const fake = forecastFake()
    fake.fail('pay_schedules', '42P01')
    go('/forecast')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('P', 'The forecast needs a one-time update. See One-time updates'))).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(screen.queryByRole('heading', { name: 'Safe to spend' })).toBeNull()
  })
})
