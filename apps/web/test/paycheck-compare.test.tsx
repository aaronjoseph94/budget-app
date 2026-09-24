import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaycheckScreen } from '../src/screens/PaycheckScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Thursday 24 September 2026, local noon. Paid every two weeks from Friday
// 18 September, so the period is 18 Sep – 1 Oct and the one before 4 – 17 Sep.
const TODAY = new Date(2026, 8, 24, 12)

const cat = (id: string, name: string, kind: Category['kind']): Category => ({ id, name, kind, sort_order: 0, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id: 'food', source: 'card_pdf',
})

/**
 * Hand-derived. Rent is 900.00 a month, so each period's share is 90,000 ×
 * 12 ÷ 26 = 41,538.46, 415.38, on both sides whatever its due day (F15).
 * 18–24 Sep: 30.00 + 415.38 = 445.38. 4–10 Sep: 50.00 + 415.38 = 465.38; the
 * 12th is past the same six days and left out. Change −20.00; 2,000 ×
 * 10,000 ÷ 46,538 = 429.8, so 430 bp, shown as 4%.
 */
function seeded(periodStart = '2026-07-01'): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('pay', 'Day job', 'income'), cat('food', 'Groceries', 'variable'), cat('rent', 'Rent', 'bill')],
    pay_schedules: [{ id: 's1', category_id: 'pay', first_pay_date: '2026-09-18', frequency: 'biweekly' }],
    category_plans: [{ id: 'p1', category_id: 'rent', effective_month: '2026-01-01', planned_cents: 90000, due_day: 1 }],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-20T12:00:00Z', period_start: periodStart, period_end: '2026-09-20' }],
    transactions: [tx('t1', '2026-09-20', -3000), tx('t2', '2026-09-06', -5000), tx('t3', '2026-09-12', -7000)],
  })
}

const line = async () => within(await screen.findByRole('group', { name: 'Compared with the last pay period' }))
const text = (s: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === s

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the Paycheck beside the last pay period (D26)', () => {
  it('sets the payday to today against the period before by the same number of days', async () => {
    renderScreen(<PaycheckScreen day={null} />, seeded())

    const s = await line()
    expect(s.getByText(text('18 – 24 Sep: $445.38 spent · 4 – 10 Sep: $465.38'))).toBeTruthy()
    expect(s.getByText(text('▼ $20.00 less (4%)'))).toBeTruthy()
  })

  it('says which statement to import when the period before starts before the records (F24)', async () => {
    renderScreen(<PaycheckScreen day={null} />, seeded('2026-09-05'))

    expect(
      (await line()).getByText('Your records start on 5 Sep. Import the statement before that to compare with the last pay period.'),
    ).toBeTruthy()
  })

  it('hides only the comparison when the period before cannot be read', async () => {
    const fake = seeded()
    fake.server.refuse = (table, query) =>
      table === 'transactions' && query.getAll('posted_on').includes('gte.2026-09-04') ? '42P01' : null
    renderScreen(<PaycheckScreen day={null} />, fake)

    expect((await line()).getByText('The last pay period did not load, so there is no comparison. Reload to try again.')).toBeTruthy()
    // The period's own figures still show: its Spent is the whole share plus 30.00.
    expect(within(screen.getByRole('region', { name: 'Summary' })).getByText('Spent').nextSibling?.textContent).toBe('$445.38')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
