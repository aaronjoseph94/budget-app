import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { REPORT_TODAY, reportFake } from './report-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

/**
 * Download CSV on Reports (plan A19), on report-seed's August. The writer is
 * the real one, counted: the module is loaded only on the first tap, and
 * toCsv runs once per tap and never on opening Reports.
 */
const writer = vi.hoisted(() => ({ loads: 0, calls: 0, fail: false }))
vi.mock('@budget/report-export', async (importOriginal) => {
  writer.loads += 1
  const real = await importOriginal<typeof import('@budget/report-export')>()
  return {
    toCsv: (rows: Parameters<typeof real.toCsv>[0]) => {
      writer.calls += 1
      if (writer.fail) throw new Error('writer failed')
      return real.toCsv(rows)
    },
  }
})

const files: { name: string; blob: Blob }[] = []
// Blob.text() drops a leading byte-order mark, which is part of what is checked.
const bytesOf = async (blob: Blob) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer())

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

async function card() {
  return (await screen.findByRole('heading', { name: 'Download CSV' })).closest('div.rounded-xl') as HTMLElement
}

beforeAll(() => warmScreen('#/reports', 'Reports'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(REPORT_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  writer.calls = 0
  writer.fail = false
  files.length = 0
  // jsdom has no object URLs and no downloads: keep what the link would have saved.
  let made: Blob | null = null
  URL.createObjectURL = (blob: Blob) => {
    made = blob
    return 'blob:report'
  }
  URL.revokeObjectURL = () => undefined
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (made !== null && this.href === 'blob:report') files.push({ name: this.download, blob: made })
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('Reports, Download CSV (plan A19)', () => {
  it('loads the writer and builds the file only on the tap, then saves the month’s charges oldest first', async () => {
    go('/reports/2026-08')
    renderScreen(<Shell />, reportFake())
    const download = await card()
    expect([writer.loads, writer.calls]).toEqual([0, 0])

    fireEvent.click(within(download).getByRole('button', { name: 'Download charges' }))
    await waitFor(() => expect(files).toHaveLength(1))
    expect([writer.loads, writer.calls]).toEqual([1, 1])
    expect(files[0]!.name).toBe('budget-2026-08-charges.csv')
    expect(await bytesOf(files[0]!.blob)).toBe(
      '\uFEFFDate,Shop,Category,List,Amount\r\n' +
        '2026-08-05,SHOP,Pay,Income,4200.00\r\n' +
        '2026-08-10,SHOP,Dining out,Variable expenses,-560.00\r\n' +
        '2026-08-15,SHOP,Flight fund,Savings,-500.00\r\n' +
        '2026-08-26,SHOP,Groceries,Variable expenses,-300.00\r\n',
    )
  })

  it('saves the Overview’s figures, the same ones the screen shows', async () => {
    go('/reports/2026-08')
    renderScreen(<Shell />, reportFake())
    fireEvent.click(within(await card()).getByRole('button', { name: 'Download summary' }))
    await waitFor(() => expect(files).toHaveLength(1))
    expect(files[0]!.name).toBe('budget-2026-08-summary.csv')
    // The Overview's test reads $2,060.00, July's $2,030.00, the usual $1,985.00 and 12% on this seed.
    expect(await bytesOf(files[0]!.blob)).toBe(
      '\uFEFFFigure,August,July,Your usual month\r\n' +
        'Income,4200.00,4200.00,4200.00\r\n' +
        'Spent,2060.00,2030.00,1985.00\r\n' +
        'Saved,500.00,300.00,300.00\r\n' +
        'Share saved,12%,,\r\n' +
        'Dining out,560.00,450.00,\r\n' +
        'Groceries,300.00,380.00,\r\n',
    )
    expect(writer.calls).toBe(1)
  })

  it('says in one line when the download did not start, and the month stays on screen', async () => {
    writer.fail = true
    go('/reports/2026-08')
    renderScreen(<Shell />, reportFake())
    fireEvent.click(within(await card()).getByRole('button', { name: 'Download charges' }))
    expect(await screen.findByText('The download did not start. Check your connection and try again; everything else still works.')).toBeTruthy()
    expect(files).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Income, Spent and Saved' })).toBeTruthy()
  })

  it('offers no download for a month the records have not reached, nor when the month did not load', async () => {
    go('/reports/2026-01')
    renderScreen(<Shell />, reportFake())
    expect(await screen.findByText(/Your records start after this month/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Download CSV' })).toBeNull()
    cleanup()

    const missing = reportFake()
    missing.fail('category_plans', '42P01')
    go('/reports/2026-08')
    renderScreen(<Shell />, missing)
    expect(await screen.findByText('Reports need a one-time update.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Download CSV' })).toBeNull()
  })
})
