import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { REPORT_TODAY, reportFake } from './report-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const card = async (title: string) => (await screen.findByRole('heading', { name: title })).closest('div.rounded-xl') as HTMLElement

beforeAll(() => warmScreen('#/reports', 'Reports'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(REPORT_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('Reports, the Overview (plan §2.6, A15)', () => {
  it('reviews a month that is over against last month and its usual month, every figure core’s', async () => {
    go('/reports/2026-08')
    renderScreen(<Shell />, reportFake())

    const totals = await card('Income, Spent and Saved')
    expect(screen.getByRole('heading', { level: 2, name: 'August 2026' })).toBeTruthy()
    expect(within(totals).getByText('August, against July')).toBeTruthy()
    expect(within(totals).getByText('$2,060.00')).toBeTruthy()
    expect(within(totals).getByText('July: $2,030.00 · $30.00 more')).toBeTruthy()
    expect(within(totals).getByText('Your usual month: $1,985.00 · $75.00 more')).toBeTruthy()
    expect(within(totals).getByText('July: $300.00 · $200.00 more')).toBeTruthy()
    expect(within(totals).getByText('You saved 12% of what came in.')).toBeTruthy()
    expect(screen.queryByText('So far')).toBeNull()
    expect(document.title).toBe('Reports · Budget')
  })

  it('opens on this month, marked so far and set against the same days of last month', async () => {
    go('/reports')
    renderScreen(<Shell />, reportFake())

    const totals = await card('Income, Spent and Saved')
    expect(screen.getByRole('heading', { level: 2, name: 'September 2026' })).toBeTruthy()
    expect(screen.getByText('So far')).toBeTruthy()
    expect(within(totals).getByText('1 – 24 Sep, against 1 – 24 Aug')).toBeTruthy()
    expect(within(totals).getByText('1 – 24 Aug: $1,760.00 · $360.00 less')).toBeTruthy()
    expect(within(totals).getByText('Your usual month is set beside a whole month, once this one is over.')).toBeTruthy()
    // No month after this one to step to.
    expect(screen.getByRole('link', { name: 'Previous month' }).getAttribute('href')).toBe('#/reports/2026-08')
    expect(screen.queryByRole('link', { name: 'Next month' })).toBeNull()
  })

  it('says there is nothing to review before the records start', async () => {
    go('/reports/2026-01')
    renderScreen(<Shell />, reportFake())

    expect(await screen.findByText('Your records start after this month, so there is nothing to review here.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Next month' }).getAttribute('href')).toBe('#/reports/2026-02')
  })

  it('says in one line that a one-time update is missing, pointing to Help, and the Month still works', async () => {
    const fake = reportFake()
    fake.fail('category_plans', '42P01')
    go('/reports/2026-08')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(/^Reports need a one-time update./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    fake.heal('category_plans')
    go('/month')
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
  })
})
