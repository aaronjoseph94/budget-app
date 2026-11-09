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

/** The two goals, with Emergency's target $10,000.00: $9,480.00 to go. */
function emergencyOfTenThousand() {
  const fake = forecastFakeWithGoals()
  const goals = fake.tables.savings_goals
  const at = goals.findIndex((g) => g.id === 'g2')
  goals[at] = { ...goals[at]!, target_cents: 1_000_000 }
  return fake
}

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

  it('keeps every goal’s date when one goal’s pace is too slow to have one (F33)', async () => {
    // Emergency, $520.00 of $10,000.00, on a fund that got 5 cents of
    // interest in each of June to August: a cent a week, 948,000 weeks,
    // past year 9999. Something is moved in, so "nothing" would be false.
    const fake = emergencyOfTenThousand()
    for (const m of ['06', '07', '08']) {
      fake.tables.transactions.push({ id: `i${m}`, posted_on: `2026-${m}-28`, amount_cents: -5, merchant_raw: 'INTEREST', category_id: 'emerg', source: 'typed' })
    }
    go('/forecast')
    renderScreen(<Shell />, fake)

    const card = await goalsCard()
    expect(await within(card).findByText('At your pace: Aug 2029 – Jul 2031')).toBeTruthy()
    expect(within(card).getByText('No date at your current pace: in a usual month, too little is moved into it.')).toBeTruthy()
    expect(within(card).queryByText(/nothing is moved into it/)).toBeNull()
  })

  it('says "or later" when only the slow end of a goal’s range is too far to have a date', async () => {
    // Emergency, $9,480.00 to go: 3 cents, $500.00 and $500.00 moved in. The
    // low pace is a cent a week, past year 9999; the middle and the high are
    // $115.38 a week, ⌈948,000 ÷ 11,538⌉ = 83 weeks from 24 September 2026:
    // 27 April 2028.
    const fake = emergencyOfTenThousand()
    const moved = (m: string, cents: number) => ({ id: `e${m}`, posted_on: `2026-${m}-12`, amount_cents: -cents, merchant_raw: 'SHOP', category_id: 'emerg', source: 'typed' })
    fake.tables.transactions.push(moved('06', 3), moved('07', 50_000), moved('08', 50_000))
    go('/forecast')
    renderScreen(<Shell />, fake)

    const card = await goalsCard()
    expect(await within(card).findByText('At your pace: Apr 2028 or later')).toBeTruthy()
    expect(within(card).getByText('Most likely Apr 2028.')).toBeTruthy()
    expect(within(card).getByText('At your pace: Aug 2029 – Jul 2031')).toBeTruthy()
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
