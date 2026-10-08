import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { EXAMPLE_TODAY, forecastFake } from './forecast-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

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
    await expectNoAxeViolations()
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
    // What is still to come is a card of its own beside the next 30 days (Mockup A step 8).
    const toCome = screen.getByRole('heading', { name: 'Still to come' }).closest('div.rounded-xl') as HTMLElement
    expect(valueOf(toCome, 'Pay still due')).toBe('$2,100.00')
    expect(valueOf(toCome, 'Bills not charged yet (already in Spent)')).toBe('$140.00')
    expect(valueOf(toCome, 'Spending at your usual pace')).toBe('about $210')
    expect(valueOf(toCome, 'Savings still planned')).toBe('$200.00')
    expect(valueOf(toCome, 'Spent by the end of September')).toBe('about $2,390')
  })

  it('sets Safe to spend and the month’s end side by side as stat cards, over the sections two across (Mockup A)', async () => {
    go('/forecast')
    renderScreen(<Shell />, forecastFake())

    const safe = (await screen.findByRole('heading', { name: 'Safe to spend' })).closest('div.rounded-xl') as HTMLElement
    const end = screen.getByRole('heading', { name: 'End of September' }).closest('div.rounded-xl') as HTMLElement
    expect(safe.parentElement).toBe(end.parentElement)
    expect(safe.parentElement?.className).toContain('sm:grid-cols-2')
    // Only Safe to spend is tinted to the accent; the month's end is a white card.
    expect(safe.className).toContain('to-primary-tint')
    expect(end.className).not.toContain('to-primary-tint')
    const sections = ['Still to come', 'The next 30 days', 'When you’ll reach your goals', 'The next three months'].map(
      (name) => screen.getByRole('heading', { name }).closest('div.rounded-xl')?.parentElement,
    )
    expect(new Set(sections).size).toBe(1)
    expect(sections[0]?.className).toContain('xl:grid-cols-2')
    await expectNoAxeViolations()
  })

  it('forecasts no balance for the month’s end without a start (D17), and still shows the Spent', async () => {
    go('/forecast')
    renderScreen(<Shell />, forecastFake(null))

    const card = (await screen.findByRole('heading', { name: 'End of September' })).closest('div.rounded-xl') as HTMLElement
    expect(within(card).queryByText('$3,280 to $3,340')).toBeNull()
    expect(within(card).queryByRole('img')).toBeNull()
    expect(within(card).getByText('Type this month’s starting balance to see where you’ll end.')).toBeTruthy()
    const toCome = screen.getByRole('heading', { name: 'Still to come' }).closest('div.rounded-xl') as HTMLElement
    expect(valueOf(toCome, 'Spent by the end of September')).toBe('about $2,390')
  })

  it('walks the next 30 days to the tightest day, and lists the bills due this week', async () => {
    go('/forecast')
    renderScreen(<Shell />, forecastFake())

    const card = (await screen.findByRole('heading', { name: 'The next 30 days' })).closest('div.rounded-xl') as HTMLElement
    expect(within(card).getByText(whole('P', 'Today: $1,760.00. Tightest day ahead: 8 Oct, at $2,032.52.'))).toBeTruthy()
    // The dot sits on 8 October's point, 14 days after today's.
    const chart = within(card).getByRole('img', { name: 'The next 30 days' })
    const points = (chart.querySelector('polyline')?.getAttribute('points') ?? '').split(' ').map((p) => p.split(',').map(Number))
    const dot = chart.querySelector('circle')
    expect(points).toHaveLength(31)
    expect([Number(dot?.getAttribute('cx')), Number(dot?.getAttribute('cy'))]).toEqual(points[14])
    expect(within(card).getByText('Counts $34.82 a day of everyday spending, your average over the last 90 days.')).toBeTruthy()
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '25 Sep InternetDue, not seen yet$80.00',
      '28 Sep Phone$60.00',
      '1 Oct Rent$1,200.00',
    ])
    expect(within(card).getByText('Leaves out $200.00 you still plan to move to savings this month.')).toBeTruthy()
  })

  it('names pay it cannot count, and says where to give it a schedule or a goal', async () => {
    // Pay has paid, but with no schedule and no goal the app cannot tell when or how much (F29).
    const fake = forecastFake()
    fake.tables.pay_schedules.splice(0)
    go('/forecast')
    renderScreen(<Shell />, fake)

    const safe = (await screen.findByRole('heading', { name: 'Safe to spend' })).closest('div.rounded-xl') as HTMLElement
    expect(within(safe).getByText('Pay from Pay is not counted: give it a pay schedule in Lists, or a goal on the Month.')).toBeTruthy()
    const days = screen.getByRole('heading', { name: 'The next 30 days' }).closest('div.rounded-xl') as HTMLElement
    expect(within(days).getByText('Leaves out pay from Pay: the app can’t tell yet when it comes or how much.')).toBeTruthy()
  })

  it('gives the debt-free date from the payoff plan, and says so when it needs a one-time update', async () => {
    const fake = forecastFake()
    // $1,200.00 at no interest, $100.00 a month from September: paid off in August 2027.
    fake.tables.debts.push({ id: 'd1', name: 'Car loan', starting_balance_cents: 120_000, minimum_payment_cents: 10_000, apr_basis_points: 0, start_date: '2026-09-01', sort_order: 0 })
    go('/forecast')
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(whole('P', 'Debt-free by August 2027 on your payoff plan. Open Debts'))).toBeTruthy()
    cleanup()

    const missing = forecastFake()
    missing.fail('debts', '42P01')
    renderScreen(<Shell />, missing)
    expect(await screen.findByText(whole('P', 'Your debt-free date needs a one-time update. See One-time updates'))).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Safe to spend' })).toBeTruthy()
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
