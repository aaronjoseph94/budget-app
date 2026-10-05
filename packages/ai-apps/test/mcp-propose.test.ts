import { describe, expect, it } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { CHANGE_SENTENCES } from '../src/proposals.js'
import { callTool, reply } from './fake-database.js'

/**
 * propose_change against a fake database (ADR 0013): one read, one
 * ai_app_propose with only the changes the server could read, and each
 * result back at its own index, the stored before and after in the words
 * the AI app reads. Nothing here applies anything.
 */
const TXN = 'eeeeeeee-0000-4000-8000-000000000001'
const READ = {
  today: '2026-10-05',
  categories: [
    { id: 'c-food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 10000 },
    { id: 'c-home', name: 'Household\u202e', kind: 'variable', sort_order: 1, weekly_budget_cents: null },
  ],
  budgets: [],
  plans: [],
  goals: [],
}
const why = { reason: 'You spent $118.40 a week lately.' }

function database(answer: (items: unknown[]) => unknown) {
  return (fn: string, args: Record<string, unknown>) => (fn === 'ai_app_read' ? reply(READ) : reply(answer(args['p_items'] as unknown[])))
}
const propose = (changes: unknown[], answer: (items: unknown[]) => unknown) => callTool(database(answer), 'propose_change', { changes })

describe('propose_change', () => {
  it('sends what it could read, and answers each change at its own index', async () => {
    const { result, rpcCalls } = await propose(
      [
        { kind: 'set_weekly_limit', category: 'Groceries', amount: '120', ...why },
        { kind: 'set_weekly_limit', category: 'Petrol', amount: '50', ...why },
        { kind: 'learn_shop', transaction: TXN, category: 'Household', ...why },
        { kind: 'move_category', category: 'Groceries', to_list: 'bill', ...why },
      ],
      () => ({
        results: [
          { index: 0, status: 'suggested', id: 'p-1', before: { cents: 10000 }, after: { cents: 12000 } },
          { index: 1, status: 'already_suggested', id: 'p-2', before: { category_id: 'c-food', rule_category_id: null }, after: { category_id: 'c-home' } },
          { index: 2, status: 'refused', refused: 'has_monthly_amount' },
        ],
        waiting: 2,
      }),
    )
    expect(rpcCalls.map((c) => /rpc\/(\w+)$/.exec(c.url)?.[1])).toEqual(['ai_app_read', 'ai_app_propose'])
    expect(JSON.parse(String(rpcCalls[0]?.init.body))).toMatchObject({ p_parts: ['categories', 'budgets', 'plans', 'goals'] })
    expect(JSON.parse(String(rpcCalls[1]?.init.body))).toEqual({
      p_items: [
        { kind: 'set_weekly_limit', category: 'c-food', amount: 12000, ...why },
        { kind: 'learn_shop', transaction: TXN, category: 'c-home', ...why },
        { kind: 'move_category', category: 'c-food', to_list: 'bill', ...why },
      ],
    })
    expect(result.structuredContent).toMatchObject({
      as_of: '2026-10-05',
      waiting_suggestions: 2,
      results: [
        {
          index: 0,
          status: 'suggested',
          id: 'p-1',
          change: { kind: 'set_weekly_limit', category: 'Groceries', from: { amount: { cents: 10000, display: '$100.00' } }, to: { amount: { cents: 12000, display: '$120.00' } } },
        },
        { index: 1, status: 'refused', refused: 'unknown_category', sentence: SENTENCES.unknown_category },
        {
          index: 2,
          status: 'already_suggested',
          change: { kind: 'learn_shop', transaction: TXN, from: { category: 'Groceries', always_filed_under: null }, to: { category: 'Household' } },
        },
        { index: 3, status: 'refused', refused: 'has_monthly_amount', sentence: CHANGE_SENTENCES.has_monthly_amount },
      ],
    })
    expect(result.structuredContent).toMatchObject({ message: expect.stringMatching(/Nothing has changed yet/) })
  })

  it('calls nothing more when no change could be read', async () => {
    const { result, rpcCalls } = await propose([{ kind: 'set_weekly_limit', category: 'Petrol', amount: '50', ...why }], () => ({}))
    expect(rpcCalls).toHaveLength(1)
    expect(result.structuredContent).toMatchObject({ waiting_suggestions: null, results: [{ status: 'refused', refused: 'unknown_category' }] })
  })

  it.each([
    ['suggesting switched off', { refused: 'suggesting_off' }, SENTENCES.suggesting_off],
    ['too few results', { results: [], waiting: 0 }, SENTENCES.server_error],
    ['a result it cannot read', { results: [{ status: 'suggested' }], waiting: 1 }, SENTENCES.server_error],
    ['an amount that is not whole cents', { results: [{ status: 'suggested', id: 'p', before: { cents: 1.5 }, after: { cents: 2 } }], waiting: 1 }, SENTENCES.server_error],
  ])('answers %s with one sentence', async (_, answer, sentence) => {
    const { result } = await propose([{ kind: 'set_weekly_limit', category: 'Groceries', amount: '120', ...why }], () => answer)
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: sentence }] })
  })

  // mcp-01 (testing, 2026-10-05): 'Groceries' and a tag character read the
  // same in Review, and were a second category past name_taken.
  it.each([
    ['a tag character in a new name', { kind: 'add_category', name: 'Groceries\u{E0078}', list: 'variable', ...why }],
    ['a variation selector in a new name', { kind: 'rename_category', category: 'Groceries', new_name: 'Food\u{FE0F}', ...why }],
    ['tag characters in a reason', { kind: 'set_weekly_limit', category: 'Groceries', amount: '120', reason: 'Fits.\u{E0053}\u{E0059}\u{E0053}' }],
  ])('reads nothing for %s', async (_, change) => {
    const { result, rpcCalls } = await propose([change], () => ({}))
    expect(result.isError).toBe(true)
    expect(rpcCalls).toEqual([])
  })

  it('reads nothing for more than twenty changes', async () => {
    const one = { kind: 'set_weekly_limit', category: 'Groceries', amount: '120', ...why }
    const { result, rpcCalls } = await propose(Array.from({ length: 21 }, () => one), () => ({}))
    expect(result.isError).toBe(true)
    expect(rpcCalls).toEqual([])
  })
})
