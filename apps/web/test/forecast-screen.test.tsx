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
/** The figure beside a label in a card's list. */
const valueOf = (card: HTMLElement, label: string) => within(card).getByText(label).nextElementSibling?.textContent

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

  it('gives where the month ends as a range, with what is still to come and the history it rests on', async () => {
    go('/forecast')
    renderScreen(<Shell />, forecastFake())

    const card = (await screen.findByRole('heading', { name: 'End of September' })).closest('div.rounded-xl') as HTMLElement
    expect(within(card).getByText('$3,280 to $3,340')).toBeTruthy()
    expect(within(card).getByText('Based on 3 months')).toBeTruthy()
    expect(within(card).getByText('Most likely $3,310.')).toBeTruthy()
    expect(within(card).getByRole('img', { name: 'Where September ends' })).toBeTruthy()
    expect(valueOf(card, 'Pay still due')).toBe('$2,100.00')
    expect(valueOf(card, 'Bills not charged yet (already in Spent)')).toBe('$140.00')
    expect(valueOf(card, 'Spending at your usual pace')).toBe('about $210')
    expect(valueOf(card, 'Savings still planned')).toBe('$200.00')
    expect(valueOf(card, 'Spent by the end of September')).toBe('about $2,390')
  })

  it('forecasts no balance for the month’s end without a start (D17), and still shows the Spent', async () => {
    go('/forecast')
    renderScreen(<Shell />, forecastFake(null))

    const card = (await screen.findByRole('heading', { name: 'End of September' })).closest('div.rounded-xl') as HTMLElement
    expect(within(card).queryByText('$3,280 to $3,340')).toBeNull()
    expect(within(card).queryByRole('img')).toBeNull()
    expect(within(card).getByText('Type this month’s starting balance to see where you’ll end.')).toBeTruthy()
    expect(valueOf(card, 'Spent by the end of September')).toBe('about $2,390')
  })

  it('says when to check back, before the 7th with no whole month of records', async () => {
    vi.setSystemTime(new Date(2026, 8, 5, 12))
    const fake = forecastFake()
    fake.tables.ingest_batches.splice(0, 1, { id: 'b1', source: 'card_pdf', created_at: '2026-09-01T12:00:00Z', period_start: '2026-08-08', period_end: '2026-08-31' })
    go('/forecast')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('Too early to tell: check back on 7 Sep.')).toBeTruthy()
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
