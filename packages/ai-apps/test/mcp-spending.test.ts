import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { callTool, reply } from './fake-database.js'
import { READ } from './owner-rows.js'

/**
 * get_spending against a fake database (PLAN §2.13, mcp-read-tools). Every
 * figure is worked by hand from the rows; core, not mocked, must give it.
 * The owner's today is Wednesday 30 September 2026, and the records start
 * with the statement from 8 August.
 */
const SPENT = {
  ...READ,
  txns: [
    { id: 't9', posted_on: '2026-09-20', amount_cents: -3000, merchant_raw: 'SHOP 12345678 TORONTO', category_id: 'food', source: 'card_csv' },
    ...READ.txns,
  ],
  not_subscriptions: ['not_subscription:NETFLIX.COM', 'category_change:food:2026-09-01:up'],
}

const spending = (args: Record<string, unknown>, read: unknown = SPENT) => callTool(() => reply(read), 'get_spending', args)
const $ = (cents: number, display: string) => ({ cents, display })
const answerOf = async (args: Record<string, unknown>) => ((await spending(args)).result.structuredContent as { answer: unknown }).answer

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('get_spending', () => {
  it('says what was spent in a category this month, reading Ask’s twelve months', async () => {
    const { result, rpcCalls } = await spending({ question: 'spend_in', categories: ['Groceries'] })
    expect(JSON.parse(String(rpcCalls[0]?.init.body))).toEqual({
      p_parts: ['categories', 'budgets', 'plans', 'txns', 'records', 'not_subscriptions'],
      p_from: '2025-08-01',
      p_to: '2026-10-31',
    })
    // 45.20 + 30.00 + 12.75.
    expect(result.structuredContent).toEqual({
      as_of: '2026-09-30',
      answer: {
        status: 'answered',
        now: { from: '2026-09-01', to: '2026-09-30' },
        before: null,
        cut_from: null,
        main: { say: 'spent_in', names: ['Groceries'], figures: { amount: $(8795, '$87.95') } },
        rows: [],
      },
    })
  })

  it('compares only inside the records: August from the 8th, with nothing before it', async () => {
    expect(await answerOf({ question: 'compare', period: 'last_month', categories: ['Groceries'] })).toEqual({
      status: 'answered',
      now: { from: '2026-08-08', to: '2026-08-31' },
      before: null,
      cut_from: '2026-08-08',
      main: { say: 'not_compared', names: ['Groceries'], figures: { amount: $(999, '$9.99') } },
      rows: [],
    })
  })

  it('names the top shops with long numbers masked', async () => {
    const got = (await answerOf({ question: 'top_shops' })) as { main: unknown; rows: unknown[] }
    expect(got.main).toEqual({ say: 'top_shops', names: ['FRESHCO'], figures: { amount: $(5795, '$57.95') } })
    expect(got.rows[1]).toEqual({ say: 'row', names: ['SHOP ******** TORONTO'], figures: { amount: $(3000, '$30.00') } })
  })

  it('picks a month by name, this year or last', async () => {
    expect(await answerOf({ question: 'spend_in', month: 'december' })).toEqual({ status: 'not_yet' })
    expect(await answerOf({ question: 'spend_in', month: 'august', year: 'last' })).toEqual({ status: 'before_records', covered_from: '2026-08-08' })
  })

  it.each([
    ['a category it does not have', { question: 'spend_in', categories: ['Nope'] }, SPENT, SENTENCES.unknown_category],
    ['Not spending, which Ask does not offer', { question: 'spend_in', categories: ['Card payments'] }, SPENT, SENTENCES.unknown_category],
    ['rows it cannot read', { question: 'subscriptions' }, { ...SPENT, not_subscriptions: 'SECRET' }, SENTENCES.records_unreadable],
    ['a refusal', { question: 'top_categories' }, { refused: 'ai_apps_off' }, SENTENCES.ai_apps_off],
  ])('answers %s with one sentence', async (_, args, read, sentence) => {
    const { result } = await spending(args, read)
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: sentence }] })
  })
})
