import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeekScreen as Week } from '../src/screens/WeekScreen.js'
import { useAddress } from '../src/nav.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Thursday 24 September 2026, local noon: the week is Monday 21 to Sunday 27.
const TODAY = new Date(2026, 8, 24, 12)

const cat = (id: string, name: string): Category => ({ id, name, kind: 'variable', sort_order: 0, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id: 'food', source: 'card_pdf',
})

/**
 * Hand-derived. 21–24 Sep: 40.00. 14–17 Sep: 65.00; the 18th is past last
 * week's Thursday and left out. Change −25.00; 2,500 × 10,000 ÷ 6,500 =
 * 3,846 bp, shown as 38%.
 */
function seeded(periodStart = '2026-07-01'): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('food', 'Groceries')],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-20T12:00:00Z', period_start: periodStart, period_end: '2026-09-20' }],
    transactions: [tx('t1', '2026-09-22', -4000), tx('t2', '2026-09-15', -6500), tx('t3', '2026-09-18', -9000), tx('t4', '2026-09-08', -1200)],
  })
}

const line = async () => within(await screen.findByRole('group', { name: 'Compared with last week' }))
const text = (s: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === s

/** The Week as App renders it, its Monday read from the address the arrows write. */
function WeekScreen() {
  return <Week monday={useAddress().param} />
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('the Week beside last week (D26)', () => {
  it('sets Monday to today against the same weekdays last week, naming both', async () => {
    renderScreen(<WeekScreen />, seeded())

    const s = await line()
    expect(s.getByText(text('21 – 24 Sep: $40.00 spent · 14 – 17 Sep: $65.00'))).toBeTruthy()
    expect(s.getByText(text('▼ $25.00 less (38%)'))).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('sets a week already over whole against the whole week before', async () => {
    renderScreen(<WeekScreen />, seeded())
    await line()

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    // The arrow writes the address, and the week follows it on hashchange.
    await screen.findByRole('heading', { name: 'Week of' })

    // 14–20 Sep: 65.00 + 90.00; 7–13 Sep: 12.00.
    expect((await line()).getByText(text('14 – 20 Sep: $155.00 spent · 7 – 13 Sep: $12.00'))).toBeTruthy()
  })

  it('never sets a new week against the week before’s read while its own is still loading', async () => {
    const fake = seeded()
    renderScreen(<WeekScreen />, fake)
    await line()

    // Hold only the read of the week before 14–20 Sep. `refuse` is asked just before `hold`, with the query.
    let asked: string[] = []
    let release = () => {}
    fake.server.refuse = (_, query) => ((asked = query.getAll('posted_on')), null)
    fake.server.hold = (table) =>
      table === 'transactions' && asked.includes('gte.2026-09-07') ? new Promise<void>((resolve) => (release = resolve)) : null
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))

    await screen.findByText((_, el) => el?.tagName === 'DD' && el.textContent === '$155.00')
    expect(screen.queryByRole('group', { name: 'Compared with last week' })).toBeNull()

    fake.server.hold = null
    release()
    expect((await line()).getByText(text('14 – 20 Sep: $155.00 spent · 7 – 13 Sep: $12.00'))).toBeTruthy()
  })

  it('says which statement to import when last week starts before the records (F24)', async () => {
    renderScreen(<WeekScreen />, seeded('2026-09-15'))

    expect(
      (await line()).getByText('Your records start on 15 Sep. Import the statement before that to compare with last week.'),
    ).toBeTruthy()
  })

  it('hides only the comparison when last week cannot be read', async () => {
    const fake = seeded()
    fake.server.refuse = (table, query) =>
      table === 'transactions' && query.getAll('posted_on').includes('gte.2026-09-14') ? 'PGRST205' : null
    renderScreen(<WeekScreen />, fake)

    expect((await line()).getByText('Last week did not load, so there is no comparison. Reload to try again.')).toBeTruthy()
    const summary = within(screen.getByRole('region', { name: 'Summary' }))
    expect(summary.getByText('Spent').nextSibling?.textContent).toBe('$40.00')
    expect(screen.queryByText(/14 – 17 Sep/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
