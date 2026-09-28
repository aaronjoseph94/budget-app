import { describe, expect, it } from 'vitest'
import { listDebtExtras, listDebts, removeDebt, removeDebtExtra, saveDebt, saveDebtExtra, type DebtEdit } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * Debts and extra payments (0014). The fake server refuses what 0014
 * refuses; each refusal is worded for the Debts screen.
 */
const edit = (over: Partial<DebtEdit> = {}): DebtEdit => ({
  name: 'Car loan',
  startingBalanceCents: 400_000,
  minimumPaymentCents: 25_000,
  aprBasisPoints: 699,
  startMonth: '2026-09-01',
  ...over,
})

function withDebts() {
  return createFakeSupabase({
    debts: [
      { id: 'd2', name: 'Student loan', starting_balance_cents: 500_000, minimum_payment_cents: 45_000, apr_basis_points: 1_200, start_date: '2026-01-01', sort_order: 1 },
      { id: 'd1', name: 'Line of credit', starting_balance_cents: 300_000, minimum_payment_cents: 15_000, apr_basis_points: 1_500, start_date: '2026-03-01', sort_order: 0 },
    ],
    debt_extra_payments: [{ id: 'x1', user_id: 'u1', debt_id: 'd1', month: '2026-05-01', amount_cents: 5_000 }],
  })
}

describe('debts', () => {
  it("reads the debts in the screen's order, and their extra payments", async () => {
    const fake = withDebts()
    expect((await listDebts(fake.client)).map((d) => d.name)).toEqual(['Line of credit', 'Student loan'])
    expect(await listDebtExtras(fake.client)).toEqual([{ id: 'x1', debt_id: 'd1', month: '2026-05-01', amount_cents: 5_000 }])
  })

  it('adds a debt at the end of the list, and changes one in place', async () => {
    const fake = withDebts()
    await saveDebt(fake.client, { userId: 'u1', debtId: null, sortOrder: 2 }, edit())
    expect(fake.tables.debts[2]).toMatchObject({ user_id: 'u1', name: 'Car loan', starting_balance_cents: 400_000, apr_basis_points: 699, start_date: '2026-09-01', sort_order: 2 })
    await saveDebt(fake.client, { userId: 'u1', debtId: 'd2', sortOrder: 1 }, edit({ name: 'Student loan', minimumPaymentCents: 50_000, startMonth: '2026-01-01' }))
    expect(fake.tables.debts.find((d) => d.id === 'd2')).toMatchObject({ minimum_payment_cents: 50_000, sort_order: 1 })
  })

  it('says a name is taken, and that a start month cannot pass an extra payment', async () => {
    const fake = withDebts()
    await expect(saveDebt(fake.client, { userId: 'u1', debtId: null, sortOrder: 2 }, edit({ name: 'Student loan' }))).rejects.toThrow(
      'You already have a debt with that name. Nothing was saved. (code 23505)',
    )
    await expect(
      saveDebt(fake.client, { userId: 'u1', debtId: 'd1', sortOrder: 0 }, edit({ name: 'Line of credit', startMonth: '2026-06-01' })),
    ).rejects.toThrow(/extra payments before that start month\. Remove them first/)
  })

  it("keeps one extra a month on a debt, replacing the month's amount", async () => {
    const fake = withDebts()
    await saveDebtExtra(fake.client, { userId: 'u1', debtId: 'd1', month: '2026-05-01', amountCents: 7_500 })
    await saveDebtExtra(fake.client, { userId: 'u1', debtId: 'd1', month: '2026-06-01', amountCents: 2_000 })
    expect(fake.tables.debt_extra_payments.map((e) => [e.id, e.month, e.amount_cents])).toEqual([
      ['x1', '2026-05-01', 7_500],
      [expect.any(String), '2026-06-01', 2_000],
    ])
    await expect(saveDebtExtra(fake.client, { userId: 'u1', debtId: 'd1', month: '2026-02-01', amountCents: 100 })).rejects.toThrow(
      /cannot come before the month the debt starts/,
    )
    await removeDebtExtra(fake.client, 'x1')
    expect(fake.tables.debt_extra_payments.map((e) => e.month)).toEqual(['2026-06-01'])
  })

  it("takes a removed debt's extra payments with it", async () => {
    const fake = withDebts()
    await removeDebt(fake.client, 'd1')
    expect(fake.tables.debts.map((d) => d.id)).toEqual(['d2'])
    expect(fake.tables.debt_extra_payments).toEqual([])
  })

  it('says which update is missing before 0014 is pasted', async () => {
    const fake = withDebts()
    fake.fail('debts', 'PGRST205')
    await expect(listDebts(fake.client)).rejects.toThrow(
      'Debts need a one-time update, so your debts cannot be shown. (code PGRST205)',
    )
    await expect(saveDebt(fake.client, { userId: 'u1', debtId: null, sortOrder: 0 }, edit())).rejects.toThrow(/need a one-time update\. Nothing was saved/)
  })
})
