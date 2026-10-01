import { describe, expect, it } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { callTool, reply } from './fake-database.js'
import { READ } from './owner-rows.js'

/**
 * get_savings_goals against a fake database (PLAN §2.13, mcp-read-tools),
 * on the owner's rows of owner-rows.ts with four goals. Worked by hand on
 * 30 September 2026:
 *
 * - Trip, the main goal, is the Trip fund's, typed at $500.00 on 30 June:
 *   +$100.00 moved in on 25 July and $25.00 taken out on 25 September make
 *   $575.00 of $2,000.00 (D16): $1,425.00 left, 2,875 bp. From its start
 *   (1 June 2026) to its date (1 June 2027) is 12 months, so $118.75 a
 *   month (F21, rounded up). No month of the records is complete yet, so
 *   no pace until 1 October; landing 1 June 2027, 244 days away, takes
 *   1,425.00 × 7 ÷ 244 = $40.882, so $40.89 a week.
 * - Flying, on no fund: $300.00 of $5,500.00, 545 bp (545.45, half-up);
 *   at $275.00 an hour, 65 minutes saved is 1 whole hour, of 20.
 * - Car, paused, and Bike, reached, are folded after the active goals,
 *   with no forecast.
 */
const goal = (id: string, name: string, sort_order: number, target: number, saved: number | string, more: Record<string, unknown> = {}) => ({
  id, name, target_cents: target, saved_cents: saved, target_date: null, unit_cost_cents: null, unit_label: null,
  created_at: `2026-01-0${sort_order + 1}T00:00:00Z`, sort_order, status: 'active', reached_on: null, category_id: null, start_date: null, balance_as_of: null, ...more,
})
const GOALS = {
  ...READ,
  categories: [...READ.categories, { id: 'fund', name: 'Trip fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null }],
  goals: [
    goal('g3', 'Bike', 0, 90000, 90000, { status: 'reached', reached_on: '2026-05-01' }),
    goal('g2', 'Flying‮', 1, 550000, '30000', { unit_cost_cents: 27500, unit_label: 'flight hours' }),
    goal('g1', 'Trip', 0, 200000, 50000, { category_id: 'fund', start_date: '2026-06-01', target_date: '2027-06-01', balance_as_of: '2026-06-30' }),
    goal('g4', 'Car', 2, 400000, 0, { status: 'paused' }),
  ],
  fund_txns: [
    { id: 'f1', posted_on: '2026-06-30', amount_cents: -5000, merchant_raw: 'TO SAVINGS', category_id: 'fund', source: 'typed' },
    { id: 'f2', posted_on: '2026-07-25', amount_cents: -10000, merchant_raw: 'TO SAVINGS', category_id: 'fund', source: 'typed' },
    { id: 'f3', posted_on: '2026-09-25', amount_cents: 2500, merchant_raw: 'FROM SAVINGS', category_id: 'fund', source: 'typed' },
  ],
}
const goals = (read: unknown = GOALS) => callTool(() => reply(read), 'get_savings_goals', {})
const $ = (cents: number, display: string) => ({ cents, display })

describe('get_savings_goals', () => {
  it('gives every goal in the owner’s order, main first, with its fund’s balance and its pace', async () => {
    const { result, rpcCalls } = await goals()
    expect(JSON.parse(String(rpcCalls[0]?.init.body)).p_parts).toEqual(['categories', 'goals', 'fund_txns', 'txns', 'records'])
    const out = result.structuredContent as { as_of: string; goals: Record<string, unknown>[] }
    expect(out.as_of).toBe('2026-09-30')
    expect(out.goals).toEqual([
      {
        name: 'Trip', status: 'active', main: true, saved: $(57500, '$575.00'), target: $(200000, '$2,000.00'), remaining: $(142500, '$1,425.00'),
        progress_bp: 2875, hours: null, target_date: '2027-06-01', monthly_contribution: $(11875, '$118.75'),
        forecast: { status: 'too_early', possible_from: '2026-10-01', weekly_needed: $(4089, '$40.89') },
      },
      {
        name: 'Flying', status: 'active', main: false, saved: $(30000, '$300.00'), target: $(550000, '$5,500.00'), remaining: $(520000, '$5,200.00'),
        progress_bp: 545, hours: { saved: 1, target: 20 }, target_date: null, monthly_contribution: null, forecast: { status: 'no_fund', weekly_needed: null },
      },
      {
        name: 'Car', status: 'paused', main: false, saved: $(0, '$0.00'), target: $(400000, '$4,000.00'), remaining: $(400000, '$4,000.00'),
        progress_bp: 0, hours: null, target_date: null, monthly_contribution: null, forecast: null,
      },
      {
        name: 'Bike', status: 'reached', main: false, saved: $(90000, '$900.00'), target: $(90000, '$900.00'), remaining: $(0, '$0.00'),
        progress_bp: 10000, hours: null, target_date: null, monthly_contribution: null, forecast: null,
      },
    ])
  })

  it('names no main goal when none is active', async () => {
    const out = (await goals({ ...GOALS, goals: [GOALS.goals[0]] })).result.structuredContent as { goals: Record<string, unknown>[] }
    expect(out.goals.map((g) => [g.name, g.main])).toEqual([['Bike', false]])
  })

  it.each([
    ['rows it cannot read', { ...GOALS, fund_txns: 'SECRET' }, SENTENCES.records_unreadable],
    ['a refusal', { refused: 'not_signed_in' }, SENTENCES.server_error],
  ])('answers %s with one sentence', async (_, read, sentence) => {
    expect((await goals(read)).result).toEqual({ isError: true, content: [{ type: 'text', text: sentence }] })
  })
})
