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
]

describe('the read tools do not depend on how many rows the database returns', () => {
  it.each(CASES)('get_period: %s', async (_, args, clock, today) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(clock))
    const out = await bothWays('get_period', args, today)
    expect(out.as_of).toBe(today)
  })
})
