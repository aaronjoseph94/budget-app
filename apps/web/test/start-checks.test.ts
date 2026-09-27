import { describe, expect, it } from 'vitest'
import { isoDate, resolvePlans } from '@budget/core'
import { viewOf } from '../src/ai/client.js'
import type { Category, ListedGoalRow } from '../src/ledger.js'
import { checksOf, type SetupReads } from '../src/start/checks.js'

/** Getting started's nine questions (plan §8.1, F49), asked of invented data. */

const category = (id: string, kind: Category['kind']): Category => ({ id, name: id, kind, sort_order: 0, weekly_budget_cents: null })
const goal = (over: Partial<ListedGoalRow> = {}): ListedGoalRow => ({
  id: 'g1', name: 'Rainy day', target_cents: 500_000, saved_cents: 0, target_date: null, unit_cost_cents: null, unit_label: null,
  created_at: '2026-01-01T00:00:00Z', sort_order: 0, status: 'active', reached_on: null, ...over,
})
/** Monthly amounts as core resolves them for September. */
const plans = (...rows: readonly [string, number | null][]) =>
  new Map(
    resolvePlans({
      asOf: isoDate('2026-09-01'),
      history: rows.map(([categoryId, plannedCents]) => ({ categoryId, effectiveMonth: isoDate('2026-09-01'), plannedCents, dueDay: 1 })),
    }).plans.map((p) => [p.categoryId, p]),
  )
const on = { ...viewOf('not_set_up'), state: 'on' as const, sentence: 'AI is on, using free Google Gemini.' }

/** Every step done. */
const done: SetupReads = {
  name: 'Alex',
  categories: [category('pay', 'income'), category('food', 'variable'), category('rent', 'bill')],
  goals: [goal()],
  pending: 0,
  schedules: { status: 'ready', byCategory: new Map([['pay', { id: 's1', category_id: 'pay', first_pay_date: '2026-09-04', frequency: 'biweekly' as const }]]) },
  amounts: { status: 'ready', plans: plans(['rent', 150_000]), totals: null, mismatch: false },
  statement: { status: 'ready', value: true },
  balance: { status: 'ready', value: 240_000 },
  ai: on,
  phone: true,
}

describe('checksOf (plan §8.1)', () => {
  it('reads each step as done from the data alone', () => {
    expect(Object.values(checksOf(done))).toEqual(Array(9).fill('done'))
  })

  it('reads a step as not done when its data is not there yet', () => {
    const none = checksOf({
      ...done,
      name: '  ',
      // Income and Not spending are not spending lists; a schedule on a bill is no payday.
      categories: [category('pay', 'income'), category('card', 'transfer')],
      goals: [goal({ status: 'paused' }), goal({ id: 'g2', target_cents: 0 })],
      pending: 3,
      schedules: { status: 'ready', byCategory: new Map([['rent', { id: 's1', category_id: 'rent', first_pay_date: '2026-09-04', frequency: 'monthly' as const }]]) },
      // Stopped from this month, or on a list that takes no monthly amount.
      amounts: { status: 'ready', plans: plans(['rent', null], ['pay', 5_000]), totals: null, mismatch: false },
      balance: { status: 'ready', value: null },
      ai: viewOf('not_set_up'),
      phone: false,
    })
    expect(none).toEqual({
      name: 'not_done', lists: 'not_done', pay: 'not_done', bills: 'not_done', goals: 'not_done',
      statement: 'not_done', balance: 'not_done', ai: 'not_done', phone: 'not_done',
    })
    // A statement in, with rows still waiting, is half done: not done.
    expect(checksOf({ ...done, pending: 1 }).statement).toBe('not_done')
    expect(checksOf({ ...done, statement: { status: 'ready', value: false } }).statement).toBe('not_done')
    // An overdrawn start is still a start.
    expect(checksOf({ ...done, balance: { status: 'ready', value: -1_000 } }).balance).toBe('done')
  })

  it('says a read that failed is can’t check yet, and one on its way is not answered', () => {
    const failed = checksOf({
      ...done,
      schedules: { status: 'failed', message: 'x' },
      amounts: { status: 'failed', message: 'x' },
      statement: { status: 'failed' },
      balance: { status: 'failed' },
      ai: viewOf('unreachable'),
    })
    expect([failed.pay, failed.bills, failed.statement, failed.balance, failed.ai]).toEqual(Array(5).fill('unknown'))
    const waiting = checksOf({ ...done, schedules: { status: 'loading' }, amounts: { status: 'loading' }, statement: { status: 'loading' }, balance: { status: 'loading' }, ai: null })
    expect([waiting.pay, waiting.bills, waiting.statement, waiting.balance, waiting.ai]).toEqual(Array(5).fill(null))
  })

  it('counts AI as done when a key works, even resting, or when it was switched off by choice', () => {
    for (const state of ['limit_reached', 'all_resting', 'all_failed', 'off'] as const) expect(checksOf({ ...done, ai: viewOf(state) }).ai).toBe('done')
    for (const state of ['not_deployed', 'needs_update', 'key_rejected', 'keys_locked'] as const) expect(checksOf({ ...done, ai: viewOf(state) }).ai).toBe('not_done')
    for (const state of ['helper_error', 'not_signed_in'] as const) expect(checksOf({ ...done, ai: viewOf(state) }).ai).toBe('unknown')
  })
})

