import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaycheckScreen } from '../src/screens/PaycheckScreen.js'
import type { Category, PayScheduleRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const category = (id: string, name: string, kind: Category['kind'], sortOrder = 0): Category => ({
  id, name, kind, sort_order: sortOrder, weekly_budget_cents: null,
})
const schedule = (id: string, categoryId: string, first: string, frequency: PayScheduleRow['frequency']): PayScheduleRow => ({
  id, category_id: categoryId, first_pay_date: first, frequency,
})

function seeded(schedules: PayScheduleRow[]): FakeSupabase {
  return createFakeSupabase({
    categories: [category('job', 'Day job', 'income', 0), category('side', 'Side work', 'income', 1), category('fund', 'Flight fund', 'savings')],
    pay_schedules: schedules,
  })
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

describe('PaycheckScreen', () => {
  it('says plainly where to set a payday when no income source has one', async () => {
    renderScreen(<PaycheckScreen day={null} />, seeded([]))

    expect((await screen.findByRole('region', { name: 'Paycheck' })).textContent).toContain(
      'It needs to know when you are paid: in Setup, give an Income row how often it pays and a first payday.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Setup' }))
    expect(window.location.hash).toBe('#/setup')
  })

  it('reads a schedule on an income source only, not one left on a category moved off Income (N27)', async () => {
    renderScreen(<PaycheckScreen day={null} />, seeded([schedule('s1', 'fund', '2026-09-11', 'biweekly')]))

    expect(await screen.findByRole('button', { name: 'Open Setup' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'This pay period' })).toBeNull()
  })

  it("follows the first income source's paydays, and the one picked when several have them", async () => {
    renderScreen(
      <PaycheckScreen day={null} />,
      seeded([schedule('s2', 'side', '2026-09-01', 'monthly'), schedule('s1', 'job', '2026-09-11', 'biweekly')]),
    )

    expect(await screen.findByText('11 – 24 Sep · Day job, paid bi-weekly')).toBeTruthy()
    fireEvent.change(await screen.findByRole('combobox', { name: 'Pay periods from' }), { target: { value: 'side' } })
    expect(await screen.findByText('1 – 30 Sep · Side work, paid monthly')).toBeTruthy()
    expect(screen.getByText(/You are paid monthly/)).toBeTruthy()
  })

  it('offers no choice with one income source on a schedule', async () => {
    renderScreen(<PaycheckScreen day={null} />, seeded([schedule('s1', 'job', '2026-09-11', 'weekly')]))

    expect(await screen.findByText('18 – 24 Sep · Day job, paid weekly')).toBeTruthy()
    expect(await screen.findByRole('region', { name: 'How this period is counted' })).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Pay periods from' })).toBeNull()
  })

  it('says pay schedules need 0011 when the table is not there yet', async () => {
    const fake = seeded([])
    fake.fail('pay_schedules', 'PGRST205')
    renderScreen(<PaycheckScreen day={null} />, fake)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Pay schedules need a database update that has not been applied yet (0011 in the setup guide), so no pay period can be shown. (code PGRST205)',
    )
    expect(screen.queryByRole('button', { name: 'Open Setup' })).toBeNull()
  })
})
