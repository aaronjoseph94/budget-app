import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { CHECKIN_TODAY, checkinFake } from './checkin-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

/** The Sunday check-in (plan §2.4, A20) on F42's example, with the app's own words. */
function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const whole = (tag: string, s: string) => (_: string, el: Element | null) => el?.tagName === tag && el.textContent === s
const section = (name: string) => screen.getByRole('heading', { name, level: 2 }).closest('div.rounded-xl') as HTMLElement
const RECAP = 'Last week you spent $226.09 on everyday things, $23.91 less than the week before. That went $16.09 past your weekly budgets.'

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(CHECKIN_TODAY)
  await warmScreen('#/coach/checkin', 'Your Sunday check-in', { fake: checkinFake(), text: 'Keep Dining out under' })
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(CHECKIN_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  go('/coach/checkin')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
  window.localStorage.clear()
})

describe('the Sunday check-in', () => {
  it('is whole with AI off: the recap, a win and one thing to try, in the app’s own words', async () => {
    const fake = checkinFake()
    fake.tables.ai_settings.push({ user_id: fake.user.id, tone: 'cheerleader', ...{ enabled: false } })
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('P', RECAP))).toBeTruthy()
    expect(screen.getByText('The week of 21 – 27 Sep')).toBeTruthy()
    expect(within(section('Last week')).getByText(whole('P', 'You spent $23.91 less than the week before. That’s a win!'))).toBeTruthy()
    expect(within(section('One thing to try')).getByText(whole('P', 'Try keeping Dining out under $65.00 next week.'))).toBeTruthy()
  })

  it('writes the weekly limit only when its button is tapped, through the Week’s save', async () => {
    const fake = checkinFake()
    renderScreen(<Shell />, fake)

    const button = await screen.findByRole('button', { name: 'Yes, set it as my weekly budget' })
    expect(screen.getByText(whole('P', 'Keep Dining out under $65.00 next week?'))).toBeTruthy()
    // Everything has drawn, and nothing is written.
    expect(fake.tables.categories.find((c) => c.id === 'dining')?.weekly_budget_cents).toBe(7_000)
    fireEvent.click(button)
    expect(await screen.findByText(whole('P', 'Done: Dining out’s weekly budget is $65.00. It shows on the Week.'))).toBeTruthy()
    expect(fake.tables.categories.find((c) => c.id === 'dining')?.weekly_budget_cents).toBe(6_500)
  })

  it('says so in one line when the weekly budget is not saved', async () => {
    const fake = checkinFake()
    fake.fail('PATCH categories', '42501')
    renderScreen(<Shell />, fake)

    fireEvent.click(await screen.findByRole('button', { name: 'Yes, set it as my weekly budget' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The weekly budget wasn’t saved. Try again, or set it on the Week.')
  })
})
