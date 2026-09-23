import { describe, expect, it } from 'vitest'
import { listPaySchedules, removeCategory, removePaySchedule, setPaySchedule, type ScheduleEdit } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * When an income source pays (0011): one schedule per source, replaced when
 * typed over, and read back as typed; its periods are core's to work out.
 * The fake server upserts on 0011's key and refuses what 0011 refuses.
 */

const pay = (firstPayDate: string, frequency: ScheduleEdit['frequency']): ScheduleEdit => ({
  userId: 'u1', categoryId: 'pay', firstPayDate, frequency,
})

function withLists() {
  return createFakeSupabase({
    categories: [
      { id: 'pay', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null },
      { id: 'rent', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null },
    ],
  })
}

describe('pay schedules', () => {
  it('writes one per income source, replaced when typed over, and removes it', async () => {
    const fake = withLists()
    await setPaySchedule(fake.client, pay('2026-09-11', 'biweekly'))
    await setPaySchedule(fake.client, pay('2026-09-04', 'weekly'))
    const read = await listPaySchedules(fake.client, 'read')
    expect(read.map((r) => [r.category_id, r.first_pay_date, r.frequency])).toEqual([['pay', '2026-09-04', 'weekly']])
    expect(fake.tables.pay_schedules[0]?.user_id).toBe('u1')
    await removePaySchedule(fake.client, 'pay')
    expect(await listPaySchedules(fake.client, 'read')).toEqual([])
  })

  it('goes with its category when that is removed', async () => {
    const fake = withLists()
    await setPaySchedule(fake.client, pay('2026-09-11', 'monthly'))
    await removeCategory(fake.client, 'pay')
    expect(fake.tables.pay_schedules).toEqual([])
  })

  it('says in words why nothing was saved', async () => {
    const fake = withLists()
    await expect(setPaySchedule(fake.client, { ...pay('2026-09-11', 'weekly'), categoryId: 'rent' })).rejects.toThrow(
      'Only an income source can have a payday. It may have been moved to another list on another device. Nothing was saved. (code 23514)',
    )
    await expect(setPaySchedule(fake.client, { ...pay('2026-09-11', 'weekly'), categoryId: 'gone' })).rejects.toThrow(
      'That category is no longer there — it may have been removed on another device. Nothing was saved. (code 23503)',
    )
    fake.fail('pay_schedules', 'PGRST205')
    await expect(setPaySchedule(fake.client, pay('2026-09-11', 'weekly'))).rejects.toThrow(
      'Pay schedules need a database update that has not been applied yet (0011 in the setup guide). Nothing was saved. (code PGRST205)',
    )
    await expect(removePaySchedule(fake.client, 'pay')).rejects.toThrow('(0011 in the setup guide). Nothing was saved.')
    expect(fake.tables.pay_schedules).toEqual([])
  })

  it('words a failed read for the screen asking, never as "nothing was saved"', async () => {
    const setup = withLists()
    setup.fail('pay_schedules', 'PGRST205')
    await expect(listPaySchedules(setup.client, 'read')).rejects.toThrow(
      'Pay schedules need a database update that has not been applied yet (0011 in the setup guide), so when you are paid is not shown. Your lists still work. (code PGRST205)',
    )
    await expect(listPaySchedules(setup.client, 'paycheck')).rejects.toThrow(
      '(0011 in the setup guide), so no pay period can be shown. (code PGRST205)',
    )
    const odd = withLists()
    odd.fail('pay_schedules', '42501')
    await expect(listPaySchedules(odd.client, 'paycheck')).rejects.toThrow(
      'When you are paid could not be read, so this pay period is not shown. Try again. (code 42501)',
    )
    await expect(listPaySchedules(odd.client, 'read')).rejects.toThrow('so it is not shown. Try again. (code 42501)')
  })
})
