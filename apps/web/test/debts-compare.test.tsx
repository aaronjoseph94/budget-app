import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DebtsScreen } from '../src/screens/DebtsScreen.js'
import type { DebtRow } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const debt = (id: string, name: string, cents: number, minimum: number, apr: number, start: string, sort: number): DebtRow => ({
  id, name, starting_balance_cents: cents, minimum_payment_cents: minimum, apr_basis_points: apr, start_date: start, sort_order: sort,
})

/**
 * Hand-derived, from debts-screen.test.tsx's debts. Loan: $102.00 after
 * August (1% of it is $1.02, so $3.02 after September's $100.00). Car: not
 * started in August, so $50.00, and paid off in September. Next year's:
 * $200.00 on both sides. A month ago 102.00 + 50.00 + 200.00 = 352.00, now
 * 203.02: 148.98 less, 14,898 × 10,000 ÷ 35,200 = 4,232 bp, 42%.
 */
const seeded = () =>
  createFakeSupabase({
    debts: [
      debt('car', 'Car', 5_000, 2_500, 0, '2026-09-01', 1),
      debt('loan', 'Loan', 30_000, 10_000, 1_200, '2026-07-01', 0),
      debt('later', "Next year's", 20_000, 5_000, 1_999, '2027-01-01', 2),
    ],
    debt_extra_payments: [{ id: 'x1', debt_id: 'car', month: '2026-09-01', amount_cents: 2_500 }],
  })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Debts against a month ago (D26)', () => {
  it("sets the schedule's balance now against the end of last month, in total and for each debt", async () => {
    renderScreen(<DebtsScreen />, seeded())

    const vs = within(await screen.findByRole('group', { name: 'Compared with a month ago' }))
    expect(vs.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'End of August: $352.00')).toBeTruthy()
    expect(vs.getByText((_, el) => el?.tagName === 'P' && el.textContent === '▼ $148.98 less (42%)')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Car' })).getByText((_, el) => el?.tagName === 'P' && el.textContent === '▼ $50.00 less (100%) than at the end of August')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: "Next year's" })).getByText('About the same as at the end of August')).toBeTruthy()
  })

  it('draws no comparison for a debt that is never paid off, which has no schedule', async () => {
    const fake = seeded()
    fake.tables.debts.push(debt('card', 'Store card', 100_000, 1_000, 2_400, '2026-01-01', 3))
    renderScreen(<DebtsScreen />, fake)

    const card = await screen.findByRole('region', { name: 'Store card' })
    expect(within(card).queryByText(/end of August/)).toBeNull()
    // The others are still compared, and the total leaves the store card out, as the summary does.
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'End of August: $352.00')).toBeTruthy()
  })
})
