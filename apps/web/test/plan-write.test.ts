import { afterEach, describe, expect, it, vi } from 'vitest'
import { listPlanHistory, moveCategory, setPlan, type PlanEdit } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * A monthly amount and day paid are written from a month on (0009, D13), one
 * row per category and month, and read back as typed; which is in effect is
 * core's to say. The fake server upserts on 0009's key and refuses what 0009
 * refuses, its two triggers included.
 */

const september = (plannedCents: number | null, dueDay: number | null = 1): PlanEdit => ({
  userId: 'u1', categoryId: 'rent', month: '2026-09-01', plannedCents, dueDay,
})
const stored = (fake: ReturnType<typeof createFakeSupabase>) =>
  fake.tables.category_plans.map((p) => [p.effective_month, p.planned_cents, p.due_day])

function withLists() {
  return createFakeSupabase({
    categories: [
      { id: 'rent', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null },
      { id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
    ],
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('setPlan', () => {
  it("writes one row for the month, replaced when typed over, and a stop as no amount, not $0", async () => {
    const fake = withLists()
    await setPlan(fake.client, september(160_000))
    await setPlan(fake.client, september(165_000, 3))
    expect(stored(fake)).toEqual([['2026-09-01', 165_000, 3]])
    expect(fake.tables.category_plans[0]?.user_id).toBe('u1')
    await setPlan(fake.client, september(null, 3))
    expect(stored(fake)).toEqual([['2026-09-01', null, 3]])
    // Another month is a row of its own; September keeps its own.
    await setPlan(fake.client, { ...september(170_000), month: '2026-10-01' })
    expect(stored(fake)).toEqual([['2026-09-01', null, 3], ['2026-10-01', 170_000, 1]])
  })

  it('says in words why nothing was saved', async () => {
    const fake = withLists()
    // N18: 0009's trigger refuses an amount on a list that cannot have one.
    await expect(setPlan(fake.client, { ...september(40_000), categoryId: 'food' })).rejects.toThrow(
      "That list can't have a monthly amount: only Bills, Debts and Subscriptions can. It may have been moved on another device. Nothing was saved. (code 23514)",
    )
    await expect(setPlan(fake.client, { ...september(100), categoryId: 'gone' })).rejects.toThrow(
      'That category is no longer there — it may have been removed on another device. Nothing was saved. (code 23503)',
    )
    const unapplied = withLists()
    unapplied.fail('category_plans', 'PGRST205')
    await expect(setPlan(unapplied.client, september(100))).rejects.toThrow(
      'Monthly amounts need a database update that has not been applied yet (0009 in the setup guide). Nothing was saved. (code PGRST205)',
    )
    const refused = withLists()
    refused.fail('category_plans', '42501')
    await expect(setPlan(refused.client, september(100))).rejects.toThrow(
      'Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)',
    )
    expect(fake.tables.category_plans).toEqual([])
  })
})

describe('a category with a monthly amount keeps its list (0009)', () => {
  it('refuses the move while the amount is in effect, and allows it once stopped', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-23T12:00:00Z'))
    const fake = withLists()
    await setPlan(fake.client, { ...september(160_000), month: '2026-01-01' })
    await expect(moveCategory(fake.client, 'rent', { kind: 'debt', sortOrder: 0 })).rejects.toThrow(
      'Remove the monthly amount first (Stop, under its amount), then move it to another list. (code 23514)',
    )
    await setPlan(fake.client, september(null))
    await moveCategory(fake.client, 'rent', { kind: 'variable', sortOrder: 1 })
    expect(fake.tables.categories.find((c) => c.id === 'rent')?.kind).toBe('variable')
  })
})

describe('listPlanHistory', () => {
  it('reads every row up to the month across pages, oldest first, and none after it', async () => {
    const fake = withLists()
    for (const [month, cents] of [['2026-10-01', 170_000], ['2026-01-01', 160_000], ['2026-09-01', null]] as const) {
      await setPlan(fake.client, { ...september(cents), month })
    }
    fake.server.maxRows = 1
    const rows = await listPlanHistory(fake.client, '2026-09-01')
    expect(rows.map((r) => [r.effective_month, r.planned_cents, r.due_day])).toEqual([
      ['2026-01-01', 160_000, 1],
      ['2026-09-01', null, 1],
    ])
  })

  it('says a missing update is missing, and never that nothing was saved', async () => {
    const fake = withLists()
    fake.fail('category_plans', 'PGRST205')
    await expect(listPlanHistory(fake.client, '2026-09-01')).rejects.toThrow(
      'Monthly amounts need a database update that has not been applied yet (0009 in the setup guide), so they are not shown. Your lists still work. (code PGRST205)',
    )
  })
})
