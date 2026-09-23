import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SetupScreen } from '../src/screens/SetupScreen.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * When each income source pays, in Setup's Income card (S15b): START
 * HERE's Paid and first payday, stored in 0011. Names are invented.
 */

const category = (id: string, name: string, kind: Category['kind']): Category => ({
  id, name, kind, sort_order: 0, weekly_budget_cents: null,
})

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [category('pay', 'Day job', 'income'), category('side', 'Side work', 'income'), category('rent', 'Rent', 'bill')],
    pay_schedules: [{ id: 's1', user_id: 'u1', category_id: 'side', first_pay_date: '2026-09-04', frequency: 'weekly' }],
  })
}
const income = async () => within(await screen.findByRole('region', { name: 'Income' }))
const stored = (fake: FakeSupabase) => fake.tables.pay_schedules.map((s) => [s.category_id, s.first_pay_date, s.frequency])

afterEach(cleanup)

describe('SetupScreen, when income is paid', () => {
  it('shows what is stored, on Income rows only', async () => {
    renderScreen(<SetupScreen />, seeded())
    const card = await income()
    const often = await card.findByRole<HTMLSelectElement>('combobox', { name: 'How often Side work pays' })
    expect(often.value).toBe('weekly')
    expect(card.getByLabelText<HTMLInputElement>('First payday for Side work').value).toBe('2026-09-04')
    expect(card.getByRole<HTMLSelectElement>('combobox', { name: 'How often Day job pays' }).value).toBe('')
    expect(screen.queryByRole('combobox', { name: 'How often Rent pays' })).toBeNull()
  })

  it('saves once both halves are there, and says what it saved', async () => {
    const fake = seeded()
    renderScreen(<SetupScreen />, fake)
    const card = await income()
    fireEvent.change(await card.findByRole('combobox', { name: 'How often Day job pays' }), { target: { value: 'biweekly' } })
    expect((await card.findByRole('alert')).textContent).toBe('Pick both how often it pays and a first payday to save it.')
    expect(stored(fake)).toHaveLength(1)

    const day = card.getByLabelText('First payday for Day job')
    fireEvent.change(day, { target: { value: '2026-09-11' } })
    fireEvent.blur(day)
    expect((await card.findByRole('status')).textContent).toBe('Day job: paid bi-weekly, from 11 Sep 2026.')
    expect(stored(fake)).toEqual([['side', '2026-09-04', 'weekly'], ['pay', '2026-09-11', 'biweekly']])
    expect(card.queryByRole('alert')).toBeNull()
  })

  it('replaces a schedule typed over, and Clear removes it', async () => {
    const fake = seeded()
    renderScreen(<SetupScreen />, fake)
    const card = await income()
    fireEvent.change(await card.findByRole('combobox', { name: 'How often Side work pays' }), { target: { value: 'monthly' } })
    await waitFor(() => expect(stored(fake)).toEqual([['side', '2026-09-04', 'monthly']]))

    fireEvent.click(await card.findByRole('button', { name: 'Clear when Side work pays' }))
    expect((await card.findByRole('status')).textContent).toBe('Side work: no set payday.')
    expect(stored(fake)).toEqual([])
    // Gone once the schedules are read back, and the fields follow what is stored.
    await waitFor(() => expect(card.queryByRole('button', { name: 'Clear when Side work pays' })).toBeNull())
    expect(card.getByLabelText<HTMLInputElement>('First payday for Side work').value).toBe('')
    expect(card.getByRole<HTMLSelectElement>('combobox', { name: 'How often Side work pays' }).value).toBe('')
  })

  it('puts back what is stored when a save is refused, and says why', async () => {
    const fake = seeded()
    fake.fail('POST pay_schedules', '23514')
    renderScreen(<SetupScreen />, fake)
    const card = await income()
    const often = await card.findByRole<HTMLSelectElement>('combobox', { name: 'How often Side work pays' })
    fireEvent.change(often, { target: { value: 'biweekly' } })
    expect((await card.findByRole('alert')).textContent).toBe(
      'Only an income source can have a payday. It may have been moved to another list on another device. Nothing was saved. (code 23514)',
    )
    expect(often.value).toBe('weekly')
    expect(stored(fake)).toEqual([['side', '2026-09-04', 'weekly']])
  })

  it('says once that schedules need 0011, and the lists still work', async () => {
    const fake = seeded()
    fake.fail('pay_schedules', 'PGRST205')
    renderScreen(<SetupScreen />, fake)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Pay schedules need a database update that has not been applied yet (0011 in the setup guide), so when you are paid is not shown. Your lists still work. (code PGRST205)',
    )
    const card = await income()
    expect(card.getByRole('textbox', { name: 'Rename Day job' })).toBeTruthy()
    expect(card.queryByRole('combobox', { name: 'How often Day job pays' })).toBeNull()
  })
})
