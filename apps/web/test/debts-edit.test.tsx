import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DebtsScreen } from '../src/screens/DebtsScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

// A loan typed from July with one extra, in August.
function seeded(): FakeSupabase {
  return createFakeSupabase({
    debts: [
      { id: 'loan', name: 'Loan', starting_balance_cents: 30_000, minimum_payment_cents: 10_000, apr_basis_points: 1_200, start_date: '2026-07-01', sort_order: 4 },
    ],
    debt_extra_payments: [{ id: 'x1', user_id: 'u1', debt_id: 'loan', month: '2026-08-01', amount_cents: 2_000 }],
  })
}

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement
const type = (label: RegExp, value: string) => fireEvent.change(field(label), { target: { value } })
const sheet = () => screen.getByRole('dialog')
const edit = async () => fireEvent.click(within(await screen.findByRole('region', { name: 'Loan' })).getByRole('button', { name: 'Edit' }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('DebtsScreen, typing debts', () => {
  it("adds a debt at the end of the list, from this month, and shows its card", async () => {
    const fake = seeded()
    renderScreen(<DebtsScreen />, fake)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a debt' }))
    expect(field(/^As of/).value).toBe('2026-09')
    type(/^Name/, 'Line <of> credit')
    type(/^Starting balance/, '3,000')
    type(/^Minimum payment/, '150')
    type(/^APR/, '19.99%')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Save debt' }))
    expect(await screen.findByText('Line <of> credit is saved.')).toBeTruthy()
    expect(fake.tables.debts[1]).toMatchObject({
      user_id: 'u1', name: 'Line <of> credit', starting_balance_cents: 300_000, minimum_payment_cents: 15_000,
      apr_basis_points: 1_999, start_date: '2026-09-01', sort_order: 5,
    })
    expect(await screen.findByRole('region', { name: 'Line <of> credit' })).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('refuses what 0014 would before sending, and says why', async () => {
    const fake = seeded()
    renderScreen(<DebtsScreen />, fake)
    await edit()
    expect(field(/^APR/).value).toBe('12.00')
    type(/^APR/, 'twelve')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Save debt' }))
    expect(within(sheet()).getByText('Type the APR as a percentage, like 19.99, or leave it empty for 0%.')).toBeTruthy()
    type(/^APR/, '12')
    // Past August's extra payment, which 0014's trigger refuses.
    type(/^As of/, '2026-09')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Save debt' }))
    expect(within(sheet()).getByText(/has extra payments before that month\. Remove them first/)).toBeTruthy()
    expect(fake.tables.debts[0]?.start_date).toBe('2026-07-01')
  })

  it("says so in the sheet when the server refuses, as for a name already used", async () => {
    const fake = seeded()
    fake.fail('PATCH debts', '23505')
    renderScreen(<DebtsScreen />, fake)
    await edit()
    type(/^Minimum payment/, '120')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Save debt' }))
    expect(await within(sheet()).findByText('You already have a debt with that name. Nothing was saved. (code 23505)')).toBeTruthy()
  })

  it('removes a debt and its extras only when asked twice', async () => {
    const fake = seeded()
    renderScreen(<DebtsScreen />, fake)
    await edit()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Remove…' }))
    expect(fake.tables.debts).toHaveLength(1)
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Remove Loan and its extras' }))
    expect(await screen.findByText('Loan is removed.')).toBeTruthy()
    expect(fake.tables.debts).toEqual([])
    expect(fake.tables.debt_extra_payments).toEqual([])
    expect(await screen.findByText('No debts yet. Add one to see when it is paid off.')).toBeTruthy()
  })
})
