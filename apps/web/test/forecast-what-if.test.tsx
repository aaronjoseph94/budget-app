import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { EXAMPLE_TODAY, forecastFakeWithGoals } from './forecast-seed.js'
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
  const heading = await screen.findByRole('heading', { name: 'When you’ll reach your goals' })
  const card = heading.closest('div.rounded-xl') as HTMLElement
  await within(card).findByRole('group', { name: 'What if you trimmed' })
  return card
}

describe('what if, on the Forecast (plan §2.5, A14, F35)', () => {
  it('changes the figures when a chip is tapped, with no call to the network', async () => {
    const fake = forecastFakeWithGoals()
    go('/forecast')
    renderScreen(<Shell />, fake)
    const card = await goalsCard()
    await screen.findByText(para('No debts on your payoff plan. Open Debts'))
    // Every read, write and call starts with one of these, before any await.
    const from = vi.spyOn(fake.client, 'from')
    const rpc = vi.spyOn(fake.client, 'rpc')
    const before = JSON.stringify(fake.tables)
    const calls = fake.functions.calls.length

    const chips = within(card).getByRole('group', { name: 'What if you trimmed' })
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['Dining out −25%', 'Dining out −10%', 'Dining out to your best month'])
    fireEvent.click(within(chips).getByRole('button', { name: 'Dining out −25%' }))
    // $265.00 a month is $61.15 a week: 99, 114 and 134 weeks; 188 − 114 = 74 sooner,
    // and $265.00 × 6 ÷ 30 = $53.00 kept of September's last 6 days.
    expect(within(card).getByText(para('Trim Dining out by $265.00 a month ($61.15 a week).'))).toBeTruthy()
    expect(within(card).getByText(para('Flight training: Aug 2028 – Apr 2029, 74 weeks sooner.'))).toBeTruthy()
    expect(within(card).getByText('That’s 58 min of flight time a month.')).toBeTruthy()
    expect(within(card).getByText(para('End of September: $3,330 to $3,390 with $53.00 kept this month.'))).toBeTruthy()
    expect(within(chips).getByRole('button', { name: 'Dining out −25%' }).getAttribute('aria-pressed')).toBe('true')

    // Another goal: the lever alone, $61.15 a week, reaches $480.00 in 8 weeks.
    fireEvent.change(within(card).getByRole('combobox', { name: 'For the goal' }), { target: { value: 'g2' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Dining out −25%' }))
    expect(within(card).getByText(para('Emergency: this alone gets you there in 8 weeks, about Nov 2026.'))).toBeTruthy()
    expect(within(card).queryByText(/of flight time a month/)).toBeNull()

    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(fake.functions.calls).toHaveLength(calls)
    expect(JSON.stringify(fake.tables)).toBe(before)
  })
})
