/**
 * Tool 4, `get_forecast` (PLAN §2.4): where this month is heading, as the
 * Forecast shows it. Every figure is core's, over the same rows renamed as
 * the Forecast renames them (forecastInput): safe to spend (F31), the
 * month's end (F30), the next 30 days (F32) and the next three months
 * (F35), and with a monthly saving, what it does for the main goal (F33,
 * whatIf). Without this month's typed start there is no balance (D17), and
 * the result says so rather than show one.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import {
  cashFlow30,
  cashFlowAhead,
  goalForecast,
  isoDate,
  monthEndForecast,
  safeToSpend,
  savingsFunds,
  whatIf,
  type MonthForecastInput,
  type Spread,
  type WhatIf,
  type WhatIfGoal,
} from '@budget/core'
import { GetForecastInputSchema } from '@budget/schema'
import { parseTypedAmount } from '@budget/statement-parsers'
import { log } from '../log.js'
import { cleanName, money } from '../money.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller } from '../rpc.js'
import { categoriesFrom, forecastInput, fundsInput, goalsAhead, goalsFrom, goalsInOrder, type Read } from '../rows.js'
import { monthsAround, utcToday } from '../windows.js'

export const DESCRIPTION =
  'Where this month is heading: safe to spend a day, the month’s end (spent and bank balance, as a low–likely–high ' +
  'range, or rough, or too early), bills and paydays in the next 30 days with the lowest day, and the next three ' +
  'months. With what_if_monthly_saving (dollars as text, like \'50\'), what saving that much a month does for the ' +
  'month’s end and the main goal’s date (what_if.status no_active_goal without one, too_small when it adds under ' +
  'a cent a week to a goal with no pace). Balance figures need this month’s starting balance; no_starting_balance says when it is missing, and ' +
  'those figures are then null. Every amount is {cents, display}; quote display. Returns as_of, ' +
  'no_starting_balance, safe_to_spend, month_end, next_30_days{today_balance, lowest, items[]}, next_3_months, what_if?.'

export type GetForecastInput = z.output<typeof GetForecastInputSchema>

const PARTS = ['categories', 'budgets', 'plans', 'txns', 'schedules', 'balances', 'records']

/** The least, the most likely and the most. */
const spread = (s: Spread | null) => (s === null ? null : { low: money(s.low), likely: money(s.mid), high: money(s.high) })
const maybe = (cents: number | null) => (cents === null ? null : money(cents))

/** Bills and paydays in the next 30 days, at most this many. */
const ITEMS = 30
/** The most a what-if saves a month: the add tools' $100,000.00. */
const MOST_CENTS = 10_000_000

const reached = (g: WhatIfGoal) =>
  g.status === 'met'
    ? { status: g.status }
    : g.status === 'alone'
      ? { status: g.status, weeks: g.weeks, date: g.date }
      : { status: g.rough ? 'rough' : 'range', early: g.dates.early, likely: g.dates.middle, late: g.dates.late, weeks_sooner: g.weeksSooner }

/**
 * The Forecast's What if… for the main goal (F35's what-if): a month's
 * saving kept from this month's end, and the goal's date at its pace
 * (F33) with the saving added, as the Forecast's chips work them out.
 */
function whatIfOut(read: Read, input: MonthForecastInput, end: Spread | null, monthlyCents: number) {
  const main = goalsAhead(goalsInOrder(goalsFrom(read['goals'])), savingsFunds(fundsInput(read, input.asOf)))[0]
  if (main === undefined) return { status: 'no_active_goal' }
  const { asOf, historyStart, readFrom, categories, entries } = input
  const forecast = goalForecast({ asOf, historyStart, readFrom, categories, entries, goal: main })
  let w: WhatIf
  try {
    w = whatIf({ asOf, monthlyCents, end, goal: { remainingCents: forecast.remainingCents, pace: forecast.pace, unitCostCents: main.unitCostCents } })
  } catch (error) {
    // A cent or two a month is $0.00 a week, which never reaches a goal with no pace: core refuses it, and no row is wrong.
    if (error instanceof RangeError) return { status: 'too_small' }
    throw error
  }
  return {
    status: 'worked_out',
    goal: cleanName(main.name),
    monthly: money(monthlyCents),
    weekly: money(w.weeklyCents),
    kept_this_month: money(w.keptThisMonthCents),
    month_end_balance: spread(w.end),
    reached: reached(w.goal),
    minutes_a_month: w.minutesPerMonth,
    unit: main.unitLabel === null ? null : cleanName(main.unitLabel),
  }
}

export async function getForecast(caller: Caller | null, input: GetForecastInput) {
  if (caller === null) return refusal('server_error')
  const saving = input.what_if_monthly_saving === undefined ? null : parseTypedAmount(input.what_if_monthly_saving)
  if (input.what_if_monthly_saving !== undefined && (saving === null || saving <= 0 || saving > MOST_CENTS)) return refusal('bad_amount')
  // Twelve months back from the owner's month and three ahead (F35), and the month either side of the server's date.
  const window = monthsAround(utcToday(), 13, 4)
  const read = await rpc(caller, 'ai_app_read', { p_parts: saving === null ? PARTS : [...PARTS, 'goals', 'fund_txns'], p_from: window.from, p_to: window.to })
  if (isRefusal(read)) {
    log('tool_get_forecast_refused')
    return refusal(read.refused)
  }
  let result
  try {
    const today = isoDate(String(read['today']))
    const sheet = forecastInput(read, today)
    const names = new Map(categoriesFrom(read['categories']).map((c) => [c.id, cleanName(c.name)]))
    const name = (id: string) => names.get(id) ?? ''
    const safe = safeToSpend(sheet)
    const end = monthEndForecast(sheet)
    const flow = cashFlow30(sheet)
    const ahead = cashFlowAhead(sheet)
    // Paydays first on a day, then the bills in the lists' order; a sort by date keeps each's own order.
    const items = [
      ...flow.pay.map((p) => ({ date: p.date, kind: 'payday', name: name(p.categoryId), amount: money(p.cents) })),
      ...flow.bills.map((b) => ({ date: b.date, kind: 'bill', name: name(b.categoryId), amount: money(b.cents), not_charged_on_its_day: b.seen === 'not_seen' })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    result = {
      as_of: today,
      no_starting_balance: sheet.startingBalanceCents === null,
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
      ...(saving === null ? {} : { what_if: whatIfOut(read, sheet, end.end, saving) }),
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
    (input) => getForecast(caller, input),
  )
}
