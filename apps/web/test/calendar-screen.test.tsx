import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarScreen } from '../src/screens/CalendarScreen.js'
import { useAddress } from '../src/nav.js'
import type { Category, LedgerRow, PayScheduleRow, PlanRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, kind: Category['kind'], sort_order: number): Category => ({
  id, name, kind, sort_order, weekly_budget_cents: null,
})
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})
const plan = (id: string, category_id: string, planned_cents: number | null, due_day: number | null): PlanRow => ({
  id, category_id, effective_month: '2026-01-01', planned_cents, due_day,
})
const pays = (id: string, category_id: string, first_pay_date: string, frequency: PayScheduleRow['frequency']): PayScheduleRow => ({
  id, category_id, first_pay_date, frequency,
})

// Hand-derived for September 2026, which starts on a Tuesday:
//   1 – 5 Sep    Rent 1,600.00 planned                         1,600.00
//   6 – 12 Sep   Phone 58.12 charged on the 8th, not its planned
//                55.00 on the 5th (D5); Day job paid the 11th      58.12
//   13 – 19 Sep  nothing                                           0.00
//   20 – 26 Sep  Tunes 11.99 planned; Day job paid the 25th        11.99
//   27 – 30 Sep  Car loan 300.00, due the 31st, on the 30th (D21)  300.00
//   Month: 1,970.11. Gym has no day paid, so is in no total.
function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      cat('rent', 'Rent', 'bill', 0),
      cat('phone', 'Phone', 'bill', 1),
      cat('gym', 'Gym', 'bill', 2),
      cat('loan', 'Car loan', 'debt', 0),
      cat('music', '<b>Tunes & more</b>', 'subscription', 0),
      cat('groceries', 'Groceries', 'variable', 0),
      cat('pay', 'Day job', 'income', 0),
      cat('fund', 'Flight fund', 'savings', 0),
    ],
    category_plans: [
      plan('p1', 'rent', 160000, 1),
      plan('p2', 'phone', 5500, 5),
      plan('p3', 'gym', 4500, null),
      plan('p4', 'loan', 30000, 31),
      plan('p5', 'music', 1199, 20),
    ],
    transactions: [tx('t1', '2026-09-08', -5812, 'phone'), tx('t2', '2026-09-03', -4000, 'groceries')],
    // The fund's schedule was left behind when it moved off Income (N27).
    pay_schedules: [pays('s1', 'pay', '2026-09-11', 'biweekly'), pays('s2', 'fund', '2026-09-01', 'monthly')],
  })
}

/** The month's total pill, once the month is in. */
async function total(): Promise<string | undefined> {
  return (await screen.findByText('Due this month:')).parentElement?.textContent ?? undefined
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('CalendarScreen', () => {
  it("shows this month's title and, in Workbook's pill, what is due in it (J3)", async () => {
    renderScreen(<CalendarScreen month={null} />, seeded())

    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy()
    expect(await total()).toBe('Due this month: $1,970.11')
  })

  it('steps a month at a time and writes it into the address', async () => {
    renderScreen(<CalendarScreen month="2026-09" />, seeded())
    await total()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(window.location.hash).toBe('#/calendar/2026-10')
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(window.location.hash).toBe('#/calendar/2026-08')
  })

  it('shows no calendar, rather than one without its planned bills, when monthly amounts cannot be read', async () => {
    const fake = seeded()
    fake.fail('category_plans', 'PGRST205')
    renderScreen(<CalendarScreen month="2026-09" />, fake)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Monthly amounts need a database update that has not been applied yet (0009 in the setup guide), so this calendar cannot be shown. (code PGRST205)',
    )
    expect(screen.queryByText('Due this month:')).toBeNull()
  })

  it('says pay schedules need 0011 when the table is not there yet', async () => {
    const fake = seeded()
    fake.fail('pay_schedules', '42P01')
    renderScreen(<CalendarScreen month="2026-09" />, fake)

    expect((await screen.findByRole('alert')).textContent).toContain('(0011 in the setup guide), so this calendar cannot be shown. (code 42P01)')
  })

  it('says so, rather than leave a bill off, when its category did not load', async () => {
    const fake = seeded()
    fake.tables.category_plans.push(plan('p9', 'gone', 100, 3))
    renderScreen(<CalendarScreen month="2026-09" />, fake)

    expect((await screen.findByRole('alert')).textContent).toContain('names a category that did not load, so the calendar is not shown')
  })
})

describe('CalendarScreen while another month loads', () => {
  function Routed() {
    return <CalendarScreen month={useAddress().period} />
  }

  it("never shows one month's bills under the next month's title", async () => {
    window.location.hash = '/calendar/2026-09'
    renderScreen(<Routed />, seeded())
    expect(await total()).toBe('Due this month: $1,970.11')

    act(() => {
      window.location.hash = '/calendar/2026-10'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeTruthy()
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByText('Due this month:')).toBeNull()

    // October: every monthly amount planned, none charged, and the Gym undated.
    expect(await total()).toBe('Due this month: $1,966.99')
  })
})
