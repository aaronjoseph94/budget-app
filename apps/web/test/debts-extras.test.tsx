import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DebtsScreen } from '../src/screens/DebtsScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

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

describe('DebtsScreen, extra payments', () => {
  it('adds an extra payment in its month, refusing one before the debt starts, and removes one', async () => {
    const fake = seeded()
    renderScreen(<DebtsScreen />, fake)
    await edit()
    const extras = within(sheet()).getByRole('region', { name: 'Extra payments' })
    expect(within(extras).getByText('August 2026')).toBeTruthy()
    type(/^Month/, '2026-06')
    type(/^Extra \(/, '50')
    fireEvent.click(within(extras).getByRole('button', { name: 'Add' }))
    expect(within(sheet()).getByText('An extra payment cannot come before July 2026, when this debt starts.')).toBeTruthy()
    type(/^Month/, '2026-10')
    fireEvent.click(within(extras).getByRole('button', { name: 'Add' }))
    expect(await within(extras).findByText('October 2026')).toBeTruthy()
    expect(fake.tables.debt_extra_payments.map((e) => [e.month, e.amount_cents])).toEqual([['2026-08-01', 2_000], ['2026-10-01', 5_000]])
    const august = within(extras).getByText('August 2026').closest('li')!
    fireEvent.click(within(august as HTMLElement).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(within(extras).queryByText('August 2026')).toBeNull())
    expect(fake.tables.debt_extra_payments.map((e) => e.month)).toEqual(['2026-10-01'])
  })

  it('keeps one extra a month, replacing its amount, and moves the payoff month', async () => {
    const fake = seeded()
    renderScreen(<DebtsScreen />, fake)
    // $300.00 at 1% from July, $20.00 extra in August: July leaves 20,000;
    // August adds 200 and pays 12,000: 8,200; September clears 8,282.
    const loan = () => screen.getByRole('region', { name: 'Loan' })
    expect(within(await screen.findByRole('region', { name: 'Loan' })).getByText('September 2026')).toBeTruthy()
    await edit()
    const extras = within(sheet()).getByRole('region', { name: 'Extra payments' })
    // $150.00 more in July leaves 5,000, which August clears.
    type(/^Month/, '2026-07')
    type(/^Extra \(/, '150')
    fireEvent.click(within(extras).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(within(loan()).getByText('August 2026')).toBeTruthy())
    // $200.00 instead clears it all in July.
    type(/^Extra \(/, '200')
    fireEvent.click(within(extras).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(within(loan()).getAllByText('July 2026')).toHaveLength(1))
    expect(fake.tables.debt_extra_payments.map((e) => [e.month, e.amount_cents])).toEqual([['2026-08-01', 2_000], ['2026-07-01', 20_000]])
    expect(within(extras).getByText('$200.00')).toBeTruthy()
  })
})

describe('DebtsScreen, an extra payment refused after its sheet is closed (CR-4)', () => {
  it('says so on the Debts screen, rather than losing it', async () => {
    const fake = seeded()
    fake.fail('POST debt_extra_payments', '42501')
    let answer = (): void => undefined
    const answered = new Promise<void>((resolve) => (answer = resolve))
    fake.server.hold = (target) => (target === 'POST debt_extra_payments' ? answered : null)
    renderScreen(<DebtsScreen />, fake)
    await edit()
    type(/^Month/, '2026-10')
    type(/^Extra \(/, '50')
    fireEvent.click(within(within(sheet()).getByRole('region', { name: 'Extra payments' })).getByRole('button', { name: 'Add' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    answer()
    const said = await screen.findByText(/^Loan, extra payment for October 2026: /)
    expect(said.textContent).toMatch(/Nothing was saved|42501/)
    expect(fake.tables.debt_extra_payments.map((e) => e.month)).toEqual(['2026-08-01'])
  })
})
