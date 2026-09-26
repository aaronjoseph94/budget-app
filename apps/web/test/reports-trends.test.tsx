import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { TRENDS_TODAY, trendsFake } from './trends-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const card = async (title: string) => (await screen.findByRole('heading', { name: title })).closest('div.rounded-xl') as HTMLElement
const openTrends = async () => fireEvent.click(await screen.findByRole('tab', { name: 'Trends' }))

beforeAll(() => warmScreen('#/reports', 'Reports'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TRENDS_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
  window.location.hash = ''
})

describe('Reports, Trends (plan §2.6, A16)', () => {
  it('draws the last six whole months and labels each line, every figure core’s', async () => {
    go('/reports/2026-08')
    renderScreen(<Shell />, trendsFake())
    await openTrends()

    const totals = await card('Income, Spent and Saved')
    expect(within(totals).getByText('The last 6 whole months, Mar 2026 to Aug 2026')).toBeTruthy()
    expect(within(totals).getByRole('img', { name: 'Income, Spent and Saved, Mar 2026 to Aug 2026' })).toBeTruthy()
    // Spent rises in 4 of 5 months, but by less than it usually swings.
    expect(within(totals).getByText('Spent', { selector: 'dt' }).nextElementSibling?.textContent).toBe('No clear trend')
    expect(within(totals).getByText('Aug 2026: income $4,000.00, spent $1,763.00, saved $500.00')).toBeTruthy()
    // Trends have no month to step through, and nothing is "so far".
    expect(screen.getByRole('navigation', { name: 'Month' }).classList.contains('hidden')).toBe(true)
    expect(screen.queryByText('So far')).toBeNull()
  })

  it('sets each category against its usual month, steady ones first', async () => {
    go('/reports')
    renderScreen(<Shell />, trendsFake())
    await openTrends()

    const list = within(await card('Each category against its usual month')).getAllByRole('listitem')
    expect(list.map((li) => li.querySelector('p')?.textContent)).toEqual(['Dining out', 'Books', 'Coffee'])
    expect(within(list[0]!).getByText('Rising steadily')).toBeTruthy()
    expect(within(list[0]!).getByText('Aug 2026 $450.00 · usual $360.00', { selector: 'p' })).toBeTruthy()
    expect(within(list[0]!).getByRole('img', { name: 'Dining out, month by month' })).toBeTruthy()
    expect(within(list[1]!).getByText('Falling steadily')).toBeTruthy()
    expect(within(list[2]!).getByText('No clear trend')).toBeTruthy()
  })

  it('shows twelve months with the ones before the records as gaps, never $0, and remembers the tab', async () => {
    go('/reports')
    renderScreen(<Shell />, trendsFake())
    await openTrends()
    await card('Income, Spent and Saved')
    fireEvent.click(screen.getByRole('button', { name: '12 months' }))

    const totals = await card('Income, Spent and Saved')
    expect(within(totals).getByText('The last 12 whole months, Sep 2025 to Aug 2026')).toBeTruthy()
    expect(within(totals).getByText('Feb 2026: no records')).toBeTruthy()
    expect(within(totals).queryByText(/Feb 2026: income \$0\.00/)).toBeNull()
    expect(screen.getByRole('button', { name: '12 months' }).getAttribute('aria-pressed')).toBe('true')

    cleanup()
    renderScreen(<Shell />, trendsFake())
    expect((await screen.findByRole('tab', { name: 'Trends' })).getAttribute('aria-selected')).toBe('true')
  })

  it('says when trends become possible, before any month is whole', async () => {
    go('/reports')
    renderScreen(<Shell />, trendsFake('2026-08-08'))
    await openTrends()

    // From 8 August, September is the first whole month, so September to December make four.
    const totals = await card('Income, Spent and Saved')
    expect(
      within(totals).getByText(
        'Nothing to draw yet: a trend starts from your first whole month of records. Trends can be called from January 2027, when your records hold four whole months.',
      ),
    ).toBeTruthy()
    expect(within(totals).queryByRole('img')).toBeNull()
    const categories = await card('Each category against its usual month')
    expect(within(categories).getByText(/No everyday spending .* Trends can be called from January 2027/)).toBeTruthy()
  })

  it('names the month a line can be called when only some months are whole', async () => {
    go('/reports')
    renderScreen(<Shell />, trendsFake('2026-06-10'))
    await openTrends()

    // From 10 June, July and August are whole: two months, so November makes four.
    const totals = await card('Income, Spent and Saved')
    expect(within(totals).getByText('Spent', { selector: 'dt' }).nextElementSibling?.textContent).toBe('Not enough months yet: check back in November 2026')
    expect(within(totals).getByText('Jun 2026: no records')).toBeTruthy()
    const list = within(await card('Each category against its usual month')).getAllByRole('listitem')
    expect(within(list[0]!).getByText('Not enough months yet: check back in November 2026')).toBeTruthy()
  })

  it('says in one line that a one-time update is missing, pointing to Help, and the Month still works', async () => {
    const fake = trendsFake()
    fake.fail('category_plans', '42P01')
    go('/reports')
    renderScreen(<Shell />, fake)
    await openTrends()

    expect(await screen.findByText(/^Reports need a one-time update./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    fake.heal('category_plans')
    go('/month')
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
  })
})
