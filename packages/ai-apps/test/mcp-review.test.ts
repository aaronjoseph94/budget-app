import { describe, expect, it } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { callTool, reply } from './fake-database.js'

/**
 * list_review_queue against a fake database (PLAN §2.13, mcp-read-tools):
 * the database's counts and its oldest rows first, each as Review shows it,
 * and no sum of amounts nobody has checked.
 */
const $ = (cents: number, display: string) => ({ cents, display })
const QUEUE = {
  today: '2026-09-30',
  waiting: 3,
  unreadable_lines: '1',
  rows: [
    { posted_on: '2026-09-28', amount_cents: -1275, merchant_raw: 'coffee‮ 4111111111', category: 'Eating out', category_source: 'model', source: 'ai_app', ai_client_id: 'c0ffee00-0000-4000-8000-000000000000' },
    { posted_on: '2026-09-29', amount_cents: '250000', merchant_raw: 'PAYROLL', category: null, category_source: null, source: 'card_csv', ai_client_id: null },
  ],
}
const review = (queue: unknown, args: Record<string, unknown> = {}) => callTool(() => reply(queue), 'list_review_queue', args)

describe('list_review_queue', () => {
  it('gives the counts and the waiting rows, and no total', async () => {
    const { result, rpcCalls } = await review(QUEUE, { limit: 2 })
    expect(rpcCalls[0]?.url).toMatch(/\/rpc\/ai_app_review$/)
    expect(JSON.parse(String(rpcCalls[0]?.init.body))).toEqual({ p_limit: 2 })
    expect(result.structuredContent).toEqual({
      as_of: '2026-09-30',
      waiting: 3,
      unreadable_lines: 1,
      returned: 2,
      rows: [
        { date: '2026-09-28', shop: 'coffee **********', flow: 'spent', amount: $(-1275, '-$12.75'), suggested_category: 'Eating out', source: 'ai_app', added_by_ai_app: true },
        { date: '2026-09-29', shop: 'PAYROLL', flow: 'received', amount: $(250000, '$2,500.00'), suggested_category: null, source: 'card_csv', added_by_ai_app: false },
      ],
    })
  })

  it('reads 20 rows unless asked, and at most 50', async () => {
    const { rpcCalls } = await review(QUEUE)
    expect(JSON.parse(String(rpcCalls[0]?.init.body))).toEqual({ p_limit: 20 })
    const { result, rpcCalls: none } = await review(QUEUE, { limit: 51 })
    expect(result.isError).toBe(true)
    expect(none).toEqual([])
  })

  it.each([
    ['rows it cannot read', { ...QUEUE, rows: 'SECRET' }, SENTENCES.records_unreadable],
    ['a refusal', { refused: 'ai_apps_off' }, SENTENCES.ai_apps_off],
  ])('answers %s with one sentence', async (_, queue, sentence) => {
    expect((await review(queue)).result).toEqual({ isError: true, content: [{ type: 'text', text: sentence }] })
  })
})
