import { describe, expect, it } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { callTool, reply } from './fake-database.js'

/**
 * suggest_review_categories against a fake database (ADR 0013): names to
 * ids from one read, as list_categories hands names out, then one
 * ai_app_suggest_categories; never a category on Not spending.
 */
const ROW = 'eeeeeeee-0000-4000-8000-000000000001'
const CATEGORIES = {
  today: '2026-10-05',
  categories: [
    { id: 'c-food', name: 'Groceries\u2066', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
    { id: 'c-card', name: 'Card payment', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
  ],
}

function database(done: unknown = { suggested: 1, skipped: 1 }) {
  return (fn: string) => (fn === 'ai_app_read' ? reply(CATEGORIES) : reply(done))
}

const suggest = (suggestions: unknown, done?: unknown) => callTool(database(done), 'suggest_review_categories', { suggestions })

describe('suggest_review_categories', () => {
  it('names each row and category by id, and says how many were suggested', async () => {
    const { result, rpcCalls } = await suggest([
      { id: ROW, category: 'Groceries' },
      { id: 'eeeeeeee-0000-4000-8000-000000000002', category: 'Groceries' },
    ])
    expect(rpcCalls.map((c) => /rpc\/(\w+)$/.exec(c.url)?.[1])).toEqual(['ai_app_read', 'ai_app_suggest_categories'])
    expect(JSON.parse(String(rpcCalls[1]?.init.body))).toEqual({
      p: [
        { candidate: ROW, category: 'c-food' },
        { candidate: 'eeeeeeee-0000-4000-8000-000000000002', category: 'c-food' },
      ],
    })
    expect(result.structuredContent).toMatchObject({ as_of: '2026-10-05', suggested: 1, skipped: 1 })
  })

  it.each([
    ['a category the owner does not have', 'Petrol'],
    ['a category on Not spending', 'Card payment'],
  ])('refuses %s, and suggests nothing', async (_, category) => {
    const { result, rpcCalls } = await suggest([{ id: ROW, category }])
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: SENTENCES.unknown_category }] })
    expect(rpcCalls).toHaveLength(1)
  })

  it.each([
    ['suggesting switched off', { refused: 'suggesting_off' }, SENTENCES.suggesting_off],
    ['an answer it cannot read', { suggested: 'some' }, SENTENCES.server_error],
  ])('answers %s with one sentence', async (_, done, sentence) => {
    expect((await suggest([{ id: ROW, category: 'Groceries' }], done)).result).toEqual({ isError: true, content: [{ type: 'text', text: sentence }] })
  })

  it('reads nothing for a row that is not an id, or more than 50', async () => {
    for (const suggestions of [[{ id: 'COSTCO', category: 'Groceries' }], Array.from({ length: 51 }, () => ({ id: ROW, category: 'Groceries' }))]) {
      const { result, rpcCalls } = await suggest(suggestions)
      expect(result.isError).toBe(true)
      expect(rpcCalls).toEqual([])
    }
  })
})
