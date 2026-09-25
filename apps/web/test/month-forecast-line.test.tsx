import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import { EXAMPLE_TODAY, forecastFake } from './forecast-seed.js'
import { renderScreen } from './render-screen.js'

/** An element whose whole text is `s`, however it is split into spans. */
const whole = (tag: string, s: string) => (_: string, el: Element | null) => el?.tagName === tag && el.textContent === s

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(EXAMPLE_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the Month’s forecast line (D27, plan A13)', () => {
  it('labels the forecast apart from End of month, which stays the workbook’s figure (F7)', async () => {
    renderScreen(<MonthScreen month={null} />, forecastFake())

    const summary = await screen.findByRole('region', { name: 'Summary' })
    const forecast = await within(summary).findByRole('link', { name: 'Forecast: about $3,310 by 30 Sep' })
    expect(forecast.getAttribute('href')).toBe('#/forecast')
    // F7: 2,000.00 + 2,100.00 − 2,180.00 − 300.00, the card's own figure, under its own label.
    expect(within(summary).getByText('End of month').nextElementSibling?.textContent).toBe('$1,620.00')
  })

  it('says in one line how the two differ, with the way to Help', async () => {
    renderScreen(<MonthScreen month={null} />, forecastFake())

    const info = await screen.findByRole('button', { name: 'How the forecast differs from End of month' })
    expect(info.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(info)
    expect(
      screen.getByText(
        whole('P', 'End of month counts what has happened and your planned bills; the forecast adds pay still due and spending at your usual pace. Two month-end figures'),
      ),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Two month-end figures' }).getAttribute('href')).toBe('#/help/month-end')
  })

  it('shows no forecast without a typed start (D17), nor on another month', async () => {
    renderScreen(<MonthScreen month={null} />, forecastFake(null))
    expect(await screen.findByText('Shown once Start is typed')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Forecast:/ })).toBeNull()
    cleanup()

    renderScreen(<MonthScreen month="2026-08" />, forecastFake())
    expect(await screen.findByRole('region', { name: 'Summary' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Forecast:/ })).toBeNull()
  })

  it('is simply not there when when-you-are-paid cannot be read, and the Month is unchanged', async () => {
    const fake = forecastFake()
    fake.fail('pay_schedules', '42P01')
    const reads: string[] = []
    fake.server.afterRead = (table) => void reads.push(table)
    renderScreen(<MonthScreen month={null} />, fake)

    const summary = await screen.findByRole('region', { name: 'Summary' })
    await vi.waitFor(() => expect(reads.filter((t) => t === 'transactions').length).toBeGreaterThanOrEqual(3))
    expect(within(summary).queryByRole('link', { name: /^Forecast:/ })).toBeNull()
    expect(within(summary).getByText('End of month').nextElementSibling?.textContent).toBe('$1,620.00')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
