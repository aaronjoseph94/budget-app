import { afterEach, describe, expect, it, vi } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { callTool, reply } from './fake-database.js'

/**
 * search_transactions against a fake database (PLAN §2.13, mcp-read-tools).
 * The database matches, orders and counts the rows; the totals over every
 * match are core's entriesTotals (F52), worked by hand here.
 */
const $ = (cents: number, display: string) => ({ cents, display })
const match = (posted_on: string, amount_cents: number, merchant_raw: string, category: string, kind: string) => ({ posted_on, amount_cents, merchant_raw, category, kind, source: 'card_csv' })

// Two returned of four matches; every match's amount and list for the totals.
const FOUND = {
  today: '2026-09-30',
  total: 4,
  rows: [match('2026-09-29', -1275, 'FRESHCO 1234567', 'Groceries', 'variable'), match('2026-09-20', 500, 'FRESHCO REFUND', 'Groceries\u202e', 'variable')],
  all: [
    { amount_cents: -1275, kind: 'variable' },
    { amount_cents: 500, kind: 'variable' },
    { amount_cents: '-4520', kind: 'variable' },
    { amount_cents: 50000, kind: 'transfer' },
  ],
}

// The owner's categories, as the search reads them first when some are named; Groceries was typed with a zero-width space.
const CATEGORIES = {
  today: '2026-09-30',
  categories: [
    { id: 'food', name: 'Groceries\u200b', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
    { id: 'card', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
  ],
}
const answers = (fn: string) => reply(fn === 'ai_app_read' ? CATEGORIES : FOUND)

afterEach(() => {
  vi.useRealTimers()
})

describe('search_transactions', () => {
  it('totals every match, not only those returned, with the words and bounds sent as given', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
    const { result, rpcCalls } = await callTool(() => reply(FOUND), 'search_transactions', { text: '50%_off', min_amount: '5', max_amount: '$1,000', flow: 'any', limit: 2 })
    expect(rpcCalls[0]?.url).toMatch(/\/rpc\/ai_app_search$/)
    // The last 90 days to the day after the server's: the owner's today is at most a day either side.
    expect(JSON.parse(String(rpcCalls[0]?.init.body))).toEqual({
      p_text: '50%_off', p_from: '2026-07-03', p_to: '2026-10-01', p_min: 500, p_max: 100000, p_categories: null, p_list: null, p_flow: 'any', p_limit: 2,
    })
    // Out 12.75 + 45.20 = 57.95; in 5.00; the card payment is counted and left out.
    expect(result.structuredContent).toEqual({
      as_of: '2026-09-30',
      window: { from: '2026-07-03', to: '2026-10-01' },
      total_matches: 4,
      totals: { spent: $(5795, '$57.95'), received: $(500, '$5.00'), count: 4, not_spending_left_out: 1 },
      returned: 2,
      truncated: true,
      rows: [
        { date: '2026-09-29', shop: 'FRESHCO *******', flow: 'spent', amount: $(-1275, '-$12.75'), category: 'Groceries', list: 'variable', source: 'card_csv' },
        { date: '2026-09-20', shop: 'FRESHCO REFUND', flow: 'received', amount: $(500, '$5.00'), category: 'Groceries', list: 'variable', source: 'card_csv' },
      ],
    })
  })

  it('gives no totals past 5,000 matches', async () => {
    const many = (fn: string) => (fn === 'ai_app_read' ? answers(fn) : reply({ ...FOUND, total: 5001, all: null }))
    const { result } = await callTool(many, 'search_transactions', { categories: ['Groceries'], list: 'transfer', from: '2024-01-01', to: '2026-09-30' })
    expect(result.structuredContent).toMatchObject({ total_matches: 5001, totals: null, returned: 2, truncated: true })
  })

  it('finds categories by the names list_categories gives, and sends the list and the flow', async () => {
    const { result, rpcCalls } = await callTool(answers, 'search_transactions', { categories: ['Groceries', 'Card payments'], list: 'variable', flow: 'spent' })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(String(rpcCalls[0]?.init.body)).p_parts).toEqual(['categories'])
    // The database matches names as stored, hidden character and all.
    expect(JSON.parse(String(rpcCalls[1]?.init.body))).toMatchObject({ p_categories: ['Groceries\u200b', 'Card payments'], p_list: 'variable', p_flow: 'spent' })
  })

  it('refuses a category the owner does not have, rather than total nothing for it', async () => {
    const { result, rpcCalls } = await callTool(answers, 'search_transactions', { categories: ['Groceries', 'groceries'] })
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: SENTENCES.unknown_category }] })
    expect(rpcCalls).toHaveLength(1)
  })

  it.each([
    ['dates that run backwards', { from: '2026-09-30', to: '2026-09-01' }],
    ['more than three years', { from: '2023-09-29', to: '2026-09-30' }],
    ['a least amount above the most', { min_amount: '20', max_amount: '10' }],
  ])('refuses %s before reading anything', async (_, args) => {
    const { result, rpcCalls } = await callTool(() => reply(FOUND), 'search_transactions', args)
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: SENTENCES.bad_search }] })
    expect(rpcCalls).toEqual([])
  })

  it('refuses an amount sent as a number', async () => {
    const { result, rpcCalls } = await callTool(() => reply(FOUND), 'search_transactions', { min_amount: 5 })
    expect(result.isError).toBe(true)
    expect(rpcCalls).toEqual([])
  })

  it.each([
    ['rows it cannot read', { ...FOUND, all: 'SECRET' }, SENTENCES.records_unreadable],
    ['a refusal', { refused: 'limit_reached' }, SENTENCES.limit_reached],
  ])('answers %s with one sentence', async (_, found, sentence) => {
    const { result } = await callTool(() => reply(found), 'search_transactions', {})
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: sentence }] })
  })
})
