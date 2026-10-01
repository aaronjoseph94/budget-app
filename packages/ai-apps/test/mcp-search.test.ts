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
  rows: [match('2026-09-29', -1275, 'FRESHCO 1234567', 'Groceries', 'variable'), match('2026-09-20', 500, 'FRESHCO REFUND', 'Groceries', 'variable')],
  all: [
    { amount_cents: -1275, kind: 'variable' },
    { amount_cents: 500, kind: 'variable' },
    { amount_cents: '-4520', kind: 'variable' },
    { amount_cents: 50000, kind: 'transfer' },
  ],
}

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
    const { result } = await callTool(() => reply({ ...FOUND, total: 5001, all: null }), 'search_transactions', { categories: ['Groceries'], list: 'transfer', from: '2024-01-01', to: '2026-09-30' })
    expect(result.structuredContent).toMatchObject({ total_matches: 5001, totals: null, returned: 2, truncated: true })
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
