/**
 * Tool 5, `get_savings_goals` (PLAN §2.4): every savings goal as Savings
 * shows it, in the owner's order with the main goal first (orderGoals,
 * F45), then the paused and the reached. What each has saved is its fund's
 * balance kept by transfers since the day it was typed (savingsFunds, D16),
 * else the amount typed; progress and hours are goalsProgress's (F45), and
 * an active goal's date at the recent pace goalForecast's (F33).
 */
import type { McpServer } from '@modelcontextprotocol/server'
import { goalForecast, goalsProgress, isoDate, savingsFunds, type GoalPace } from '@budget/core'
import { GetSavingsGoalsInputSchema } from '@budget/schema'
import { log } from '../log.js'
import { cleanName, money } from '../money.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller } from '../rpc.js'
import { fundsInput, goalBase, goalsAhead, goalsFrom, goalsInOrder, savedOf } from '../rows.js'
import { monthsAround, utcToday } from '../windows.js'

export const DESCRIPTION =
  'Every savings goal in the owner’s order, main first, then paused and reached: saved, target, left, progress, ' +
  'hours for a goal priced per hour, target date and the monthly contribution Savings shows from its start and target dates, and when an active goal ' +
  'will be reached at the recent pace (a range, rough, or why there is no date). Every amount is {cents, display}; ' +
  'quote display. Returns as_of and goals[{name, status, main, saved, target, remaining, progress_bp, hours, ' +
  'target_date, monthly_contribution, forecast}].'

const PARTS = ['categories', 'goals', 'fund_txns', 'txns', 'records']

function paceOut(pace: GoalPace) {
  switch (pace.status) {
    case 'too_early':
      return { status: pace.status, possible_from: pace.possibleFrom }
    case 'no_pace':
      return { status: pace.status, months: pace.months }
    case 'rough':
      return { status: pace.status, months: pace.months, weekly: money(pace.weeklyCents), date: pace.date }
    case 'range':
      return {
        status: pace.status,
        months: pace.months,
        weekly: { low: money(pace.weekly.low), likely: money(pace.weekly.middle), high: money(pace.weekly.high) },
        early: pace.dates.early,
        likely: pace.dates.middle,
        late: pace.dates.late,
      }
    default:
      return { status: pace.status }
  }
}

export async function getSavingsGoals(caller: Caller | null) {
  if (caller === null) return refusal('server_error')
  // The Coach's year, for the recent pace, and the month either side of the server's date.
  const window = monthsAround(utcToday(), 13, 1)
  const read = await rpc(caller, 'ai_app_read', { p_parts: PARTS, p_from: window.from, p_to: window.to })
  if (isRefusal(read)) {
    log('tool_get_savings_goals_refused')
    return refusal(read.refused)
  }
  let result
  try {
    const today = isoDate(String(read['today']))
    const funds = savingsFunds(fundsInput(read, today))
    const ordered = goalsInOrder(goalsFrom(read['goals']))
    const ahead = new Map(goalsAhead(ordered, funds).map((g) => [g.id, g]))
    const base = goalBase(read, today)
    const progress = goalsProgress({
      goals: ordered.map((g) => ({ id: g.id, targetCents: g.target_cents, savedCents: savedOf(g, funds), unitCostCents: g.unit_cost_cents })),
    }).goals
    result = {
      as_of: today,
      goals: ordered.map((g, i) => {
        const p = progress[i]!
        const goal = ahead.get(g.id)
        const plan = (funds.funds.find((f) => f.figures?.goalId === g.id)?.figures ?? funds.unlinked.find((u) => u.goalId === g.id))?.plan
        const forecast = goal === undefined ? null : goalForecast({ ...base, goal })
        return {
          name: cleanName(g.name),
          status: g.status,
          main: goal !== undefined && goal.id === ordered[0]?.id,
          saved: money(p.savedCents),
          target: money(p.targetCents),
          remaining: money(p.remainingCents),
          progress_bp: p.progressBp,
          hours: p.hours,
          target_date: g.target_date,
          monthly_contribution: plan?.monthlyContributionCents == null ? null : money(plan.monthlyContributionCents),
          forecast: forecast === null ? null : { ...paceOut(forecast.pace), weekly_needed: forecast.neededWeeklyCents === null ? null : money(forecast.neededWeeklyCents) },
        }
      }),
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  log('tool_get_savings_goals_ok', { rows: result.goals.length })
  return answer(result)
}

export function registerGetSavingsGoals(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'get_savings_goals',
    { title: 'Savings goals', description: DESCRIPTION, inputSchema: GetSavingsGoalsInputSchema, annotations: READ_ONLY, _meta: SIGNED_IN },
    () => getSavingsGoals(caller),
  )
}
