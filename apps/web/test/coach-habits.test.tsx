import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { HABITS_TODAY, habitsFake } from './habits-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

/**
 * The Coach's habit wins (plan A18, F40), on the Habits seed: five whole
 * weeks in a row within $210.00 a week since Dining out's dear meal of 12
 * August, and $150.00 of Groceries' budget left in the last of them.
 */
async function headings(): Promise<(string | null)[]> {
  const region = await screen.findByRole('region', { name: 'Insights' })
  return within(region).getAllByRole('heading').map((h) => h.textContent)
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeAll(async () => {
  // The cards wait on a year's read and the digest, which run cold in a file's first test (N90).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(HABITS_TODAY)
  await warmScreen('#/coach', 'Coach', { fake: habitsFake(), text: 'On a roll' })
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(HABITS_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  localStorage.clear()
  go('/coach')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('the Coach’s habit wins', () => {
  it('cheers the weeks in a row within budget, with the figures behind it', async () => {
    renderScreen(<Shell />, habitsFake())
    expect(await headings()).toContain('On a roll: 5 weeks within budget')
    const card = screen.getByRole('heading', { name: 'On a roll: 5 weeks within budget' }).closest('li')!
    expect(card.textContent).toContain('Your everyday spending stayed within your weekly budgets 5 weeks in a row. Your longest run is 5 weeks.')
    fireEvent.click(within(card).getByRole('button', { name: 'Why am I seeing this?' }))
    const why = await screen.findByRole('dialog')
    expect(within(why).getByText('Left to spend in the last whole week').nextSibling?.textContent).toBe('$150.00')
    expect(within(why).getByText('The last whole week began').nextSibling?.textContent).toBe('14 Sep')
  })

  it('opens Reports on Habits from the card', async () => {
    renderScreen(<Shell />, habitsFake())
    await headings()
    const card = screen.getByRole('heading', { name: 'On a roll: 5 weeks within budget' }).closest('li')!
    fireEvent.click(within(card).getByRole('button', { name: 'See your habits' }))
    expect((await screen.findByRole('tab', { name: 'Habits' })).getAttribute('aria-selected')).toBe('true')
  })

  it('has no streak to cheer without a weekly budget', async () => {
    renderScreen(<Shell />, habitsFake('2026-02-01', false))
    expect(await headings()).not.toContain('On a roll: 5 weeks within budget')
  })
})
