import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { REPORT_TODAY, reportFake } from './report-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

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
    await expectNoAxeViolations()
  })

  it('names the biggest changes against the usual month, each way', async () => {
    go('/reports/2026-08')
    renderScreen(<Shell />, reportFake())

    const movers = await card('Biggest changes')
    const up = within(movers).getByRole('heading', { name: 'More than usual' }).parentElement as HTMLElement
    expect(within(up).getByText('Dining out')).toBeTruthy()
    expect(within(up).getByText('$155.00 more than usual ($405.00)')).toBeTruthy()
    const down = within(movers).getByRole('heading', { name: 'Less than usual' }).parentElement as HTMLElement
    expect(within(down).getByText('$80.00 less than usual ($380.00)')).toBeTruthy()
    expect(within(movers).getByText('Against your usual month over the 6 months before, Variable expenses only.')).toBeTruthy()
  })

  it('sets each category beside last month as bars, and as a list of the same figures', async () => {
    go('/reports/2026-08')
    renderScreen(<Shell />, reportFake())

    const pairs = await card('This month and last, by category')
    expect(within(pairs).getByRole('img', { name: 'August against July, by category' })).toBeTruthy()
    const row = within(pairs).getByText('Dining out', { selector: 'dt' }).nextElementSibling
    expect(row?.textContent).toBe('$560.00 · $450.00')
    // The list says which figure is which, since it has no key of its own.
    expect(within(pairs).getByText('Each row: August, then July.')).toBeTruthy()
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

  it('sets "So far" beside the title and the review over the sections two across (Mockup A)', async () => {
    go('/reports')
    renderScreen(<Shell />, reportFake())

    const totals = await card('Income, Spent and Saved')
    const title = screen.getByRole('heading', { level: 1, name: 'Reports' })
    expect(title.parentElement?.contains(screen.getByText('So far'))).toBe(true)
    const review = await card('The month in review')
    expect(review.className).toContain('to-primary-tint')
    const grid = totals.parentElement as HTMLElement
    expect(grid.className).toContain('xl:grid-cols-2')
    expect(grid.contains(review)).toBe(false)
    for (const name of ['Biggest changes', 'This month and last, by category', 'Download CSV']) expect(grid.contains(await card(name))).toBe(true)
    await expectNoAxeViolations()
  })

  it('moves along the tabs with the arrow keys, Home and End, remembering the one chosen, with one tab stop', async () => {
    go('/reports')
    renderScreen(<Shell />, reportFake())
    await card('Income, Spent and Saved')

    const tab = (name: string) => screen.getByRole('tab', { name })
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([0, -1, -1, -1])
    fireEvent.keyDown(tab('Overview'), { key: 'ArrowRight' })
    expect(tab('Trends').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Trends'))
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([-1, 0, -1, -1])
    expect(localStorage.getItem('budget.reports.tab')).toBe('trends')
    fireEvent.keyDown(tab('Trends'), { key: 'End' })
    expect(document.activeElement).toBe(tab('Habits'))
    fireEvent.keyDown(tab('Habits'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tab('Overview'))
    fireEvent.keyDown(tab('Overview'), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(tab('Habits'))
    fireEvent.keyDown(tab('Habits'), { key: 'Home' })
    expect(tab('Overview').getAttribute('aria-selected')).toBe('true')
    expect(localStorage.getItem('budget.reports.tab')).toBe('overview')
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

describe('Save as PDF', () => {
  it('prints the page as it is, less the bars and buttons, so the PDF holds the screen’s figures', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    go('/reports/2026-08')
    renderScreen(<Shell />, reportFake())

    const totals = await card('Income, Spent and Saved')
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
    // Nothing a figure sits in is left off the page; the bars, the tabs and the button are.
    const hidden = [...document.querySelectorAll('.print\\:hidden')]
    expect(hidden.some((el) => el.contains(totals))).toBe(false)
    expect(hidden.some((el) => el.contains(screen.getByRole('heading', { level: 2, name: 'August 2026' })))).toBe(false)
    for (const bar of screen.getAllByRole('navigation', { name: 'Screens' })) expect(bar.closest('.print\\:hidden')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Save as PDF' }).classList.contains('print:hidden')).toBe(true)
  })
})
