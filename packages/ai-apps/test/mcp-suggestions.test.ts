import { describe, expect, it } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { callTool, reply } from './fake-database.js'

/**
 * list_suggestions against a fake database (ADR 0013): what was suggested
 * and what became of it, by the names things have now; a stored row that
 * does not parse is listed as unreadable, never guessed at.
 */
const ID = '11111111-1111-4111-8111-111111111111'
const CAT = '22222222-2222-4222-8222-222222222222'
const TXN = '33333333-3333-4333-8333-333333333333'
const common = { client_id: '99999999-9999-4999-8999-999999999999', reason: 'Rent rose.', created_at: '2026-10-05T06:00:00+00:00', expires_at: '2026-10-19T06:00:00+00:00' }
const ANSWER = {
  today: '2026-10-05',
  waiting: 2,
  rows: [
    { ...common, id: ID, kind: 'set_budget', status: 'pending', decided_at: null, target: { category_id: CAT, month: '2026-11-01', applies: 'onward' }, after: { cents: 45000 }, before: { cents: null } },
    { ...common, id: ID, kind: 'learn_shop', status: 'dismissed', decided_at: '2026-10-06T06:00:00+00:00', target: { transaction_id: TXN }, after: { category_id: CAT }, before: { category_id: '44444444-4444-4444-8444-444444444444', rule_category_id: null } },
    { ...common, id: ID, kind: 'add_category', status: 'applied', decided_at: '2026-10-06T06:00:00+00:00', target: { name: 'Pets', list: 'variable' }, after: { name: 'Pets', list: 'variable' }, before: { exists: false } },
    { ...common, id: ID, kind: 'set_weekly_limit', status: 'expired', decided_at: null, target: { category_id: CAT }, after: { cents: 1.5 }, before: { cents: null } },
  ],
  categories: [{ id: CAT, name: 'Groceries\u202e', kind: 'variable' }],
  goals: [],
  transactions: [{ id: TXN, posted_on: '2026-09-03', amount_cents: '-5420', merchant_raw: 'COSTCO 1234567' }],
}
const list = (answer: unknown, args: Record<string, unknown> = {}) => callTool(() => reply(answer), 'list_suggestions', args)

describe('list_suggestions', () => {
  it('lists each suggestion and what became of it, by the names things have now', async () => {
    const { result, rpcCalls } = await list(ANSWER, { status: 'any', limit: 4 })
    expect(JSON.parse(String(rpcCalls[0]?.init.body))).toEqual({ p_status: 'any', p_limit: 4 })
    expect(result.structuredContent).toMatchObject({ as_of: '2026-10-05', waiting: 2, returned: 4 })
    const rows = (result.structuredContent as { rows: unknown[] }).rows
    expect(rows[0]).toEqual({
      id: ID,
      kind: 'set_budget',
      status: 'pending',
      suggested_at: common.created_at,
      decided_at: null,
      expires_at: common.expires_at,
      change: { category: 'Groceries', month: '2026-11', applies: 'onward', from: { amount: null }, to: { amount: { cents: 45000, display: '$450.00' } } },
      reason: 'Rent rose.',
    })
    expect(rows[1]).toMatchObject({
      status: 'dismissed',
      change: {
        transaction: { date: '2026-09-03', shop: 'COSTCO *******', amount: { cents: -5420, display: '-$54.20' } },
        from: { category: 'a removed category', always_filed_under: null },
        to: { category: 'Groceries' },
      },
    })
    expect(rows[2]).toMatchObject({ kind: 'add_category', change: { from: null, to: { name: 'Pets', list: 'variable' } } })
    expect(rows[3]).toEqual({ id: ID, kind: null, status: 'expired', suggested_at: common.created_at, decided_at: null, expires_at: common.expires_at, unreadable: true })
  })

  it('reads every status and 20 rows unless asked', async () => {
    const { rpcCalls } = await list(ANSWER)
    expect(JSON.parse(String(rpcCalls[0]?.init.body))).toEqual({ p_status: 'any', p_limit: 20 })
  })

  it.each([
    ['rows it cannot read', { ...ANSWER, transactions: 'SECRET' }, SENTENCES.records_unreadable],
    ['a refusal', { refused: 'disconnected' }, SENTENCES.disconnected],
  ])('answers %s with one sentence', async (_, answer, sentence) => {
    expect((await list(answer)).result).toEqual({ isError: true, content: [{ type: 'text', text: sentence }] })
  })
})
