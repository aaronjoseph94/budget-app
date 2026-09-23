import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SetupScreen } from '../src/screens/SetupScreen.js'
import type { Category, PlanRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Workbook's Bills tab inside Setup (S9): each Bills, Debts and Subscriptions
 * row's day paid and monthly amount, from this month on (D13). Today is fixed
 * at 23 September 2026, so "this month" is September. Names are Workbook's
 * placeholders; amounts are invented.
 */

const TODAY = new Date('2026-09-23T12:00:00')

const category = (id: string, name: string, kind: Category['kind'], sortOrder: number): Category => ({
  id,
  name,
  kind,
  sort_order: sortOrder,
  weekly_budget_cents: null,
})
const plan = (id: string, categoryId: string, month: string, cents: number | null, day: number | null): PlanRow => ({
  id,
  category_id: categoryId,
  effective_month: `${month}-01`,
  planned_cents: cents,
  due_day: day,
})

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      category('rent', 'Rent', 'bill', 0),
      category('phone', 'Phone', 'bill', 1),
      category('car-loan', 'Car Loan', 'debt', 0),
      category('netflix', 'Netflix', 'subscription', 0),
      category('groceries', 'Groceries', 'variable', 0),
    ],
    category_plans: [
      plan('p1', 'rent', '2026-01', 160_000, 1),
      plan('p2', 'phone', '2026-03', 8_500, null),
      plan('p3', 'netflix', '2026-01', 1_799, 23),
      plan('p4', 'netflix', '2026-06', null, 23),
    ],
  })
}

const card = async (name: string) => within(await screen.findByRole('region', { name }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SetupScreen, reading monthly amounts', () => {
  it('says once that monthly amounts need 0009, and the lists still work', async () => {
    const fake = seeded()
    fake.fail('category_plans', 'PGRST205')
    renderScreen(<SetupScreen />, fake)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      'Monthly amounts need a database update that has not been applied yet (0009 in the setup guide), so they are not shown. Your lists still work. (code PGRST205)',
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    const field = (await card('Bills')).getByRole('textbox', { name: 'Rename Phone' })
    fireEvent.change(field, { target: { value: 'Mobile' } })
    fireEvent.blur(field)
    await waitFor(() => expect(fake.tables.categories.find((c) => c.id === 'phone')?.name).toBe('Mobile'))
  })

  it('says so when an amount names a category that is not there, rather than total without it', async () => {
    const fake = seeded()
    fake.tables.category_plans.push(plan('p9', 'gone', '2026-02', 5_000, 3))
    renderScreen(<SetupScreen />, fake)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'A monthly amount names a category that did not load, so the totals are not shown. Reload to try again.',
    )
  })

  it('waits for the amounts read after a category is removed, rather than call them wrong', async () => {
    const fake = seeded()
    renderScreen(<SetupScreen />, fake)
    const bills = await card('Bills')
    await bills.findByRole('button', { name: 'Remove Phone' })
    // The amounts read after the removal are held back: until they arrive,
    // the ones read before it still name Phone.
    let release = () => {}
    fake.server.hold = (table) => (table === 'category_plans' ? new Promise<void>((resolve) => (release = resolve)) : null)
    fireEvent.click(bills.getByRole('button', { name: 'Remove Phone' }))

    await waitFor(() => expect(bills.queryByRole('textbox', { name: 'Rename Phone' })).toBeNull())
    expect(fake.tables.category_plans.map((p) => p.id)).toEqual(['p1', 'p3', 'p4'])
    expect(screen.queryByRole('alert')).toBeNull()
    fake.server.hold = null
    release()
    await waitFor(() => expect(bills.getByRole('textbox', { name: 'Rename Rent' })).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
