import { describe, expect, it } from 'vitest'
import { FIRST_FILE, UPDATES, checkUpdates, nextStep, type Checked } from '../src/help/updates.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

const stateOf = (checked: readonly Checked[], prefix: string) => checked.find((c) => c.update.file.startsWith(prefix))?.state
const missing = (checked: readonly Checked[]) => checked.filter((c) => c.state !== 'in').map((c) => [c.update.file.slice(0, 4), c.state])

describe('checking the one-time updates', () => {
  it('finds each one in when everything it adds answers', async () => {
    const fake = createFakeSupabase()
    const checked = await checkUpdates(fake.client)
    expect(checked.map((c) => c.update.file.slice(0, 4))).toEqual(['0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015'])
    expect(missing(checked)).toEqual([])
    expect(nextStep(checked)).toEqual({ kind: 'done' })
  })

  it('reads PGRST205, and 42P01 from an older server, as a table not there', async () => {
    const fake = createFakeSupabase()
    fake.fail('category_budgets', 'PGRST205')
    fake.fail('debt_extra_payments', '42P01')
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0008', 'missing'], ['0014', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0008_category_budgets.sql', fromStart: false })
  })

  it('reads PGRST202, and 42883 from Postgres, as a function not there', async () => {
    const fake = createFakeSupabase()
    delete fake.rpcReplies['recategorise_transaction']
    fake.fail('rpc/dismiss_unreadable_line', '42883')
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0006', 'missing'], ['0012', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0006_recategorise.sql', fromStart: false })
  })

  it('reads 42703 as a column not there, and with 0005 missing starts at HANDOFF’s first file', async () => {
    const fake = createFakeSupabase()
    fake.server.refuse = (table, query) => (table === 'categories' && query.get('select') === 'kind' ? '42703' : null)
    const checked = await checkUpdates(fake.client)
    expect(stateOf(checked, '0005')).toBe('missing')
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: FIRST_FILE, fromStart: true })
  })

  // G1's update adds columns to a table that is already there, so it is
  // proven by reading one of them, as 0013's is.
  it('reads 42703 on a goal’s place as 0015 not in yet, after everything before it', async () => {
    const fake = createFakeSupabase()
    fake.server.refuse = (table, query) => (table === 'savings_goals' && query.get('select') === 'sort_order' ? '42703' : null)
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0015', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0015_savings_goals_order.sql', fromStart: false })
  })

  it('says it could not check, never "missing", when the answer is something else', async () => {
    const fake = createFakeSupabase()
    fake.fail('month_balances', 'PGRST301')
    fake.fail('rpc/recategorise_transaction', '')
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0006', 'unknown'], ['0010', 'unknown']])
    expect(nextStep(checked)).toEqual({ kind: 'unknown' })
  })

  it('names the first missing one even when another could not be checked', async () => {
    const fake = createFakeSupabase()
    fake.fail('month_balances', 'PGRST301')
    fake.fail('pay_schedules', 'PGRST205')
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: '0011_pay_schedules.sql', fromStart: false })
  })

  it('changes nothing: tables are read for no rows, functions sent the nil id', async () => {
    const fake: FakeSupabase = createFakeSupabase({
      transactions: [{ id: 't1', posted_on: '2026-09-02', amount_cents: -100, merchant_raw: 'SHOP', category_id: 'c1', source: 'manual' }],
    })
    const before = JSON.stringify(fake.tables)
    await checkUpdates(fake.client)
    expect(JSON.stringify(fake.tables)).toBe(before)
    const nil = '00000000-0000-0000-0000-000000000000'
    expect(fake.rpcCalls).toEqual([
      { name: 'recategorise_transaction', args: { p_transaction: nil, p_category: nil, p_learn: false } },
      { name: 'dismiss_unreadable_line', args: { p_line: nil } },
    ])
    expect(UPDATES.every((u) => u.adds.trim() !== '')).toBe(true)
  })
})
