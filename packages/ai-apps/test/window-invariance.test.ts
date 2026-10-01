import { afterEach, describe, expect, it, vi } from 'vitest'
import { callTool } from './fake-database.js'
import { fourYears, readOf } from './four-years.js'

/**
 * PLAN §2.4, "the same rows as the screen": each read tool, over four
 * years of rows, gives the same answer whether the database cuts its rows
 * to the window the tool asked for or returns every one. The server's
 * clock is set where the owner's day is on the other side of a month's
 * end, which is where a window one month too short would show.
 */
async function bothWays(tool: string, args: Record<string, unknown>, today: string) {
  const all = fourYears(today)
  const cut = await callTool(readOf(all, false), tool, args)
  const whole = await callTool(readOf(all, true), tool, args)
  expect(cut.result.isError).toBeUndefined()
  expect(cut.result.structuredContent).toEqual(whole.result.structuredContent)
  return cut.result.structuredContent as Record<string, unknown>
}

afterEach(() => {
  vi.useRealTimers()
})

// [what, the tool's arguments, the server's clock (UTC), the owner's today]
const CASES: readonly (readonly [string, Record<string, unknown>, string, string])[] = [
  ['this month, the server already in the next', {}, '2026-10-01T03:00:00Z', '2026-09-30'],
  ['this month, the server still in the last', {}, '2026-09-30T20:00:00Z', '2026-10-01'],
  ['a month asked for by date', { date: '2024-02-29' }, '2026-09-30T12:00:00Z', '2026-09-30'],
  ['this week, the server already in the next month', { period: 'week' }, '2026-10-01T03:00:00Z', '2026-09-30'],
  ['this week across a month, the server a day behind', { period: 'week' }, '2026-09-30T20:00:00Z', '2026-10-01'],
  ['a week across a year', { period: 'week', date: '2025-01-01' }, '2026-09-30T12:00:00Z', '2026-09-30'],
  ['a week reaching back into the month before', { period: 'week', date: '2026-10-02' }, '2026-09-30T12:00:00Z', '2026-09-30'],
  // Paid monthly on the 15th: a period runs into the next month.
  ['this pay period, the server already in the next month', { period: 'pay_period' }, '2026-10-01T03:00:00Z', '2026-09-30'],
  ['this pay period, the server a day behind', { period: 'pay_period' }, '2026-09-30T20:00:00Z', '2026-10-01'],
  ['a pay period asked for by its last day', { period: 'pay_period', date: '2026-10-14' }, '2026-09-30T12:00:00Z', '2026-09-30'],
  ['this year, the server already in the next', { period: 'year' }, '2026-01-01T03:00:00Z', '2025-12-31'],
  ['this year, the server still in the last', { period: 'year' }, '2025-12-31T20:00:00Z', '2026-01-01'],
  ['a year asked for by date', { period: 'year', date: '2024-06-15' }, '2026-09-30T12:00:00Z', '2026-09-30'],
]

describe('the read tools do not depend on how many rows the database returns', () => {
  it.each(CASES)('get_period: %s', async (_, args, clock, today) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(clock))
    const out = await bothWays('get_period', args, today)
    expect(out.as_of).toBe(today)
  })
})

const QUESTIONS = ['spend_in', 'compare', 'top_categories', 'top_shops', 'subscriptions', 'explain_month'] as const
const ASKED: readonly Record<string, unknown>[] = [{}, { period: 'last_year' }, { period: 'last_three_months' }, { month: 'october', year: 'last' }]
// The server's clock either side of a month's end from the owner's today, and on a month's last day.
const CLOCKS = [
  ['2026-10-01T03:00:00Z', '2026-09-30'],
  ['2026-09-30T20:00:00Z', '2026-10-01'],
  ['2026-03-31T12:00:00Z', '2026-03-31'],
] as const

describe('get_spending does not depend on how many rows the database returns', () => {
  it.each(QUESTIONS.flatMap((question) => CLOCKS.map(([clock, today]) => [question, clock, today] as const)))('%s, the server at %s', async (question, clock, today) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(clock))
    for (const asked of ASKED) {
      const out = await bothWays('get_spending', { question, categories: ['Groceries'], ...asked }, today)
      expect(out.as_of).toBe(today)
    }
  })
})

describe('get_debts does not depend on how many rows the database returns', () => {
  it('reads every debt whatever the window', async () => {
    const out = await bothWays('get_debts', { debt: 'Car', months: 36 }, '2026-09-30')
    expect((out.schedule as unknown[]).length).toBeGreaterThan(0)
  })
})

describe('get_forecast does not depend on how many rows the database returns', () => {
  it.each(CLOCKS)('the server at %s', async (clock, today) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(clock))
    const out = await bothWays('get_forecast', { what_if_monthly_saving: '250' }, today)
    expect((out.next_3_months as { months: unknown[] }).months).toHaveLength(3)
    // Trip leads, and its fund's pace gives a range: every transfer since 2022 is read for its balance.
    expect(out.what_if).toMatchObject({ goal: 'Trip', reached: { status: 'range' } })
  })
})

describe('get_savings_goals does not depend on how many rows the database returns', () => {
  it.each(CLOCKS)('the server at %s', async (clock, today) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(clock))
    const out = await bothWays('get_savings_goals', {}, today)
    // The fund typed in 2022 counts every transfer since, and its pace is a range.
    expect((out.goals as Record<string, unknown>[])[0]).toMatchObject({ name: 'Trip', main: true, forecast: { status: 'range' } })
  })
})
