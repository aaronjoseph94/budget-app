import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { EXAMPLE_TODAY, forecastFakeWithGoals } from './forecast-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** A paragraph whose whole text is `s`, however it is split into spans. */
const para = (s: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === s

beforeAll(() => warmScreen('#/forecast', 'Forecast'))

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

async function goalsCard(): Promise<HTMLElement> {
  return (await screen.findByRole('heading', { name: 'When you’ll reach your goals' })).closest('div.rounded-xl') as HTMLElement
}

describe('when you’ll reach your goals, on the Forecast (plan §2.5, A14)', () => {
  it('gives every active goal’s date, the main goal first', async () => {
    go('/forecast')
    renderScreen(<Shell />, forecastFakeWithGoals())

    const card = await goalsCard()
    expect(await within(card).findByText('At your pace: Aug 2029 – Jul 2031')).toBeTruthy()
    expect(within(within(card).getByRole('list')).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Flight training', 'Emergency'])
    expect(within(card).getByText('Most likely May 2030.')).toBeTruthy()
    expect(within(card).getByText('No date at your current pace: in a usual month, nothing is moved into it.')).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('says its goals’ dates need a one-time update when the funds cannot be read, and the rest shows', async () => {
    const fake = forecastFakeWithGoals()
    fake.server.lacks = { savings_goals: ['category_id', 'balance_as_of'] }
    go('/forecast')
    renderScreen(<Shell />, fake)

    const card = await goalsCard()
    expect(await within(card).findByText(para('Your goals’ dates need a one-time update. See One-time updates'))).toBeTruthy()
    expect(within(card).getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(screen.getByRole('heading', { name: 'The next three months' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Safe to spend' })).toBeTruthy()
  })
})
