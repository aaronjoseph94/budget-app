import { describe, expect, it } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { callTool, reply } from './fake-database.js'
import { READ } from './owner-rows.js'

/**
 * get_forecast against a fake database (PLAN §2.13, mcp-read-tools), on
 * the owner's rows of owner-rows.ts. Worked by hand, on Wednesday 30
 * September 2026, the month's last day:
 *
 * - So far: a $1,000.00 start, $2,500.00 of pay, and Spent $1,257.95: the
 *   two Groceries charges ($45.20 and $12.75) and Rent's $1,200.00, planned
 *   and not charged, so it stands in Spent (D5). The card payment is Not
 *   spending and counts nowhere.
 * - Safe to spend: 1,000.00 + 2,500.00 − 1,257.95 = $2,242.05, over 1 day.
 *   Pay has no paydays and no goal, so it is not counted.
 * - Today's balance: 1,000.00 + 2,500.00 − 57.95 = $3,442.05.
 * - Spending a day: $67.94 of Groceries over the 54 days from 8 August
 *   (the records' start) is $1.258, so $1.26.
 * - The lowest of the next 30 days, 30 October: September's rent, not seen
 *   on its day, counts tomorrow, and October's on the 1st:
 *   3,442.05 − 1,200.00 − 1,200.00 − 30 × 1.26 = $1,004.25.
 * - No complete month yet, so the month's end is rough: Spent to $10,
 *   $1,260.00, and the balance $2,240.00; the months ahead wait for 1 October.
 */
const forecast = (read: unknown = READ) => callTool(() => reply(read), 'get_forecast', {})
const $ = (cents: number, display: string) => ({ cents, display })
const rent = (late: boolean) => ({ date: '2026-10-01', kind: 'bill', name: 'Rent', amount: $(120000, '$1,200.00'), not_charged_on_its_day: late })

describe('get_forecast', () => {
  it('gives safe to spend, the month’s end and the next 30 days', async () => {
    const { result, rpcCalls } = await forecast()
    expect(JSON.parse(String(rpcCalls[0]?.init.body)).p_parts).toEqual(['categories', 'budgets', 'plans', 'txns', 'schedules', 'balances', 'records'])
    const out = result.structuredContent as Record<string, Record<string, unknown>>
    expect(out.no_starting_balance).toBe(false)
    expect(out.safe_to_spend).toEqual({ status: 'ok', per_day: $(224205, '$2,242.05'), days: 1, available: $(224205, '$2,242.05'), pay_not_counted: ['Pay'] })
    expect(out.month_end).toMatchObject({
      status: 'rough',
      complete_months: 0,
      so_far: { starting_balance: $(100000, '$1,000.00'), income: $(250000, '$2,500.00'), spent: $(125795, '$1,257.95'), saved: $(0, '$0.00') },
      bills_not_charged_yet: $(120000, '$1,200.00'),
      spent: { low: $(126000, '$1,260.00'), likely: $(126000, '$1,260.00'), high: $(126000, '$1,260.00') },
      balance: { low: $(224000, '$2,240.00'), likely: $(224000, '$2,240.00'), high: $(224000, '$2,240.00') },
    })
    expect(out.next_30_days).toMatchObject({
      today_balance: $(344205, '$3,442.05'),
      lowest: { date: '2026-10-30', balance: $(100425, '$1,004.25') },
      items: [rent(true), rent(false)],
      truncated: false,
      spending_a_day: $(126, '$1.26'),
      pay_left_out: ['Pay'],
    })
    expect(out.next_3_months).toEqual({ status: 'too_early', check_back_on: '2026-10-01', complete_months: 0, pay_not_counted: [], months: [] })
  })

  it('says when there is no starting balance, and gives no balance', async () => {
    const out = (await forecast({ ...READ, balances: [] })).result.structuredContent as Record<string, Record<string, unknown>>
    expect(out.no_starting_balance).toBe(true)
    expect(out.safe_to_spend).toMatchObject({ status: 'no_start', per_day: null, available: null })
    expect(out.month_end).toMatchObject({ balance: null, so_far: { starting_balance: null } })
    expect(out.next_30_days).toMatchObject({ today_balance: null, lowest: null, items: [rent(true), rent(false)] })
  })

  // Flying leads the owner's order, on no fund, $300.00 of $5,500.00 saved, at $275.00 an hour.
  const goal = (id: string, name: string, sort_order: number, more: Record<string, unknown> = {}) => ({
    id, name, target_cents: 550000, saved_cents: '30000', target_date: null, unit_cost_cents: null, unit_label: null, created_at: `2026-01-0${sort_order + 1}T00:00:00Z`,
    sort_order, status: 'active', reached_on: null, category_id: null, start_date: null, balance_as_of: null, ...more,
  })
  const GOALS = { goals: [goal('g1', 'Trip', 1), goal('g2', 'Flying', 0, { unit_cost_cents: 27500, unit_label: 'flight hours' })], fund_txns: [] }

  it('works out a month’s saving, sent as text, for the main goal', async () => {
    const { result, rpcCalls } = await callTool(() => reply({ ...READ, ...GOALS }), 'get_forecast', { what_if_monthly_saving: '100' })
    expect(JSON.parse(String(rpcCalls[0]?.init.body)).p_parts).toEqual(['categories', 'budgets', 'plans', 'txns', 'schedules', 'balances', 'records', 'goals', 'fund_txns'])
    // $100.00 a month is 100.00 × 12 ÷ 52 = $23.077, so $23.08 a week; today is the month's last day, so nothing is
    // kept this month and the end stays $2,240.00. On no fund there is no pace: $5,200.00 ÷ $23.08 is 225.3, so 226
    // weeks, 1,582 days after 30 September 2026: 29 January 2031. 100.00 of 275.00 an hour is 21.8, so 22 minutes.
    expect((result.structuredContent as Record<string, unknown>).what_if).toEqual({
      status: 'worked_out',
      goal: 'Flying',
      monthly: $(10000, '$100.00'),
      weekly: $(2308, '$23.08'),
      kept_this_month: $(0, '$0.00'),
      month_end_balance: { low: $(224000, '$2,240.00'), likely: $(224000, '$2,240.00'), high: $(224000, '$2,240.00') },
      reached: { status: 'alone', weeks: 226, date: '2031-01-29' },
      minutes_a_month: 22,
      unit: 'flight hours',
    })
  })

  it('says when there is no active goal to work a saving out for', async () => {
    const out = (await callTool(() => reply({ ...READ, goals: [], fund_txns: [] }), 'get_forecast', { what_if_monthly_saving: '$1,000.5' })).result
    expect((out.structuredContent as Record<string, unknown>).what_if).toEqual({ status: 'no_active_goal' })
  })

  it.each([['0'], ['100,000.01'], [100]])('refuses a saving of %j before reading anything', async (saving) => {
    const { result, rpcCalls } = await callTool(() => reply({ ...READ, ...GOALS }), 'get_forecast', { what_if_monthly_saving: saving })
    expect(result.isError).toBe(true)
    if (typeof saving === 'string') expect(result.content).toEqual([{ type: 'text', text: SENTENCES.bad_amount }])
    expect(rpcCalls).toEqual([])
  })

  it.each([
    ['rows it cannot read', { ...READ, schedules: 'SECRET' }, SENTENCES.records_unreadable],
    ['a refusal', { refused: 'ai_apps_off' }, SENTENCES.ai_apps_off],
  ])('answers %s with one sentence', async (_, read, sentence) => {
    const { result } = await forecast(read)
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: sentence }] })
  })
})
