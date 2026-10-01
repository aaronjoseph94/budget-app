/**
 * Tool 4, `get_forecast` (PLAN §2.4): where this month is heading, as the
 * Forecast shows it. Every figure is core's, over the same rows renamed as
 * the Forecast renames them (forecastInput): safe to spend (F31), the
 * month's end (F30), the next 30 days (F32) and the next three months
 * (F35). Without this month's typed start there is no balance (D17), and
 * the result says so rather than show one.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import { cashFlow30, cashFlowAhead, isoDate, monthEndForecast, safeToSpend, type Spread } from '@budget/core'
import { GetForecastInputSchema } from '@budget/schema'
import { log } from '../log.js'
import { cleanName, money } from '../money.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller } from '../rpc.js'
import { categoriesFrom, forecastInput } from '../rows.js'
import { monthsAround, utcToday } from '../windows.js'

export const DESCRIPTION =
  'Where this month is heading: safe to spend a day, the month’s end (spent and bank balance, as a low–likely–high ' +
  'range, or rough, or too early), bills and paydays in the next 30 days with the lowest day, and the next three ' +
  'months. Balance figures need this month’s starting balance; no_starting_balance says when it is missing, and ' +
  'those figures are then null. Every amount is {cents, display}; quote display. Returns as_of, ' +
  'no_starting_balance, safe_to_spend, month_end, next_30_days{today_balance, lowest, items[]}, next_3_months.'

const PARTS = ['categories', 'budgets', 'plans', 'txns', 'schedules', 'balances', 'records']

/** The least, the most likely and the most. */
const spread = (s: Spread | null) => (s === null ? null : { low: money(s.low), likely: money(s.mid), high: money(s.high) })
const maybe = (cents: number | null) => (cents === null ? null : money(cents))

/** Bills and paydays in the next 30 days, at most this many. */
const ITEMS = 30

export async function getForecast(caller: Caller | null) {
  if (caller === null) return refusal('server_error')
  // Twelve months back from the owner's month and three ahead (F35), and the month either side of the server's date.
  const window = monthsAround(utcToday(), 13, 4)
  const read = await rpc(caller, 'ai_app_read', { p_parts: PARTS, p_from: window.from, p_to: window.to })
  if (isRefusal(read)) {
    log('tool_get_forecast_refused')
    return refusal(read.refused)
  }
  let result
  try {
    const today = isoDate(String(read['today']))
    const input = forecastInput(read, today)
    const names = new Map(categoriesFrom(read['categories']).map((c) => [c.id, cleanName(c.name)]))
    const name = (id: string) => names.get(id) ?? ''
    const safe = safeToSpend(input)
    const end = monthEndForecast(input)
    const flow = cashFlow30(input)
    const ahead = cashFlowAhead(input)
    // Paydays first on a day, then the bills in the lists' order; a sort by date keeps each's own order.
    const items = [
      ...flow.pay.map((p) => ({ date: p.date, kind: 'payday', name: name(p.categoryId), amount: money(p.cents) })),
      ...flow.bills.map((b) => ({ date: b.date, kind: 'bill', name: name(b.categoryId), amount: money(b.cents), not_charged_on_its_day: b.seen === 'not_seen' })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    result = {
      as_of: today,
      no_starting_balance: input.startingBalanceCents === null,
      safe_to_spend: { status: safe.status, per_day: maybe(safe.perDayCents), days: safe.days, available: maybe(safe.availableCents), pay_not_counted: safe.payNotCounted.map(name) },
      month_end: {
        status: end.status,
        check_back_on: end.checkBackOn,
        complete_months: end.completeMonths,
        so_far: { starting_balance: maybe(end.startCents), income: money(end.incomeCents), spent: money(end.spentCents), saved: money(end.savedCents) },
        pay_still_due: money(end.pay.dueCents),
        bills_not_charged_yet: money(end.billsNotChargedCents),
        savings_still_planned: money(end.savingsPlannedCents),
        spending_still_to_come: maybe(end.variableToComeCents),
        spent: spread(end.spent),
        balance: spread(end.end),
      },
      next_30_days: {
        today_balance: maybe(flow.todayCents),
        lowest: flow.lowest === null ? null : { date: flow.lowest.date, balance: money(flow.lowest.balanceCents) },
        items: items.slice(0, ITEMS),
        truncated: items.length > ITEMS,
        spending_a_day: maybe(flow.dailyVariableCents),
        savings_not_moved: money(flow.savingsNotMovedCents),
        pay_left_out: flow.payLeftOut.map(name),
      },
      next_3_months: {
        status: ahead.status,
        check_back_on: ahead.checkBackOn,
        complete_months: ahead.completeMonths,
        pay_not_counted: ahead.payNotCounted.map(name),
        months: ahead.months.map((m) => ({
          month: m.month.slice(0, 7),
          pay: money(m.payCents),
          bills: money(m.billsCents),
          savings: money(m.savingsCents),
          spending: spread(m.variable),
          net: spread(m.net),
          balance: spread(m.balance),
        })),
      },
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  log('tool_get_forecast_ok', { rows: result.next_30_days.items.length })
  return answer(result)
}

export function registerGetForecast(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'get_forecast',
    { title: 'Forecast', description: DESCRIPTION, inputSchema: GetForecastInputSchema, annotations: READ_ONLY, _meta: SIGNED_IN },
    () => getForecast(caller),
  )
}
