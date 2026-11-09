import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAddress } from '../src/nav.js'
import { ScreenBoundary } from '../src/shell/ScreenBoundary.js'

/**
 * An address names a period only in years a budget is kept in. The engine's
 * calendar ends at 0000 and 9999 and a screen steps a period either side of
 * the one shown, so a period at either end was read and then could not be
 * drawn. And where one period does fail to draw, another period of the same
 * screen is tried afresh.
 */
const CRASHED = 'This screen did not load. Check your connection, then reload.'
const HOME = readAddress('#/')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the years an address may name', () => {
  it.each(['#/month/9999-12', '#/month/0000-01', '#/year/9999-01', '#/reports/0000-01', '#/calendar/9999-12', '#/paycheck/9999-12-31', '#/week/0000-01-03', '#/month/1899-12', '#/month/3000-01'])(
    'opens the first screen for %s',
    (hash) => expect(readAddress(hash)).toEqual(HOME),
  )

  it('still reads the periods a budget is kept in', () => {
    expect(readAddress('#/month/1900-01')).toEqual({ screen: 'month', param: '1900-01' })
    expect(readAddress('#/month/2999-12')).toEqual({ screen: 'month', param: '2999-12' })
    expect(readAddress('#/week/2026-09-21')).toEqual({ screen: 'week', param: '2026-09-21' })
    expect(readAddress('#/paycheck/2028-02-29')).toEqual({ screen: 'paycheck', param: '2028-02-29' })
  })
})

describe('a period that cannot be drawn', () => {
  function Period({ of }: { of: string }) {
    if (of === '2026-08') throw new RangeError('this month cannot be drawn')
    return <h1>{of}</h1>
  }

  it('does not keep the same screen from drawing another period', () => {
    // React reports the error it caught; the boundary's words are what is asserted.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(
      <ScreenBoundary screen="month" param="2026-08">
        <Period of="2026-08" />
      </ScreenBoundary>,
    )
    expect(screen.getByText(CRASHED)).toBeTruthy()

    view.rerender(
      <ScreenBoundary screen="month" param="2026-09">
        <Period of="2026-09" />
      </ScreenBoundary>,
    )
    expect(screen.queryByText(CRASHED)).toBeNull()
    expect(screen.getByRole('heading', { name: '2026-09' })).toBeTruthy()
  })
})
