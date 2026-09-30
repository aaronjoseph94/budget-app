/**
 * Tool 3, `get_spending` (PLAN §2.4): the questions the app's Ask answers
 * from figures alone, answered by core's answerQuery (F48) over the same
 * year of rows Ask reads, renamed as Ask renames them. The AI app has
 * already read the question into its parts; this names the categories and
 * hands the answer out with the app's own display words.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { answerQuery, isoDate, type AnswerLine, type AskPeriod, type Figure } from '@budget/core'
import { ASK_MONTHS, GetSpendingInputSchema } from '@budget/schema'
import { log } from '../log.js'
import { cleanName, cleanShop, money } from '../money.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller } from '../rpc.js'
import { askInput, categoriesFrom } from '../rows.js'
import { monthsAround, utcToday } from '../windows.js'

export type GetSpendingInput = z.output<typeof GetSpendingInputSchema>

export const DESCRIPTION =
  'Answers the questions the app’s Ask answers: spending in some categories over a period (spend_in), the same ' +
  'compared with the days before (compare), the top categories, the top shops, subscriptions, and what changed this ' +
  'month (explain_month). `period` defaults to this month; `month` with `year` picks a month by name instead. ' +
  'Figures only; the app’s Ask says the same. Every amount is {cents, display}; quote display. Returns as_of and ' +
  'answer{status, now, before, cut_from, main{say, names, figures}, rows[]}; status not_yet or before_records when ' +
  'there are no figures for that period.'

const PARTS = ['categories', 'budgets', 'plans', 'txns', 'records', 'not_subscriptions']

/** A figure with the app's display words for money; dates and counts as they are. */
function figureOut(f: Figure) {
  switch (f.unit) {
    case 'cents':
    case 'dollars':
      return money(f.value)
    case 'change':
      return { ...money(f.value), direction: f.direction }
    case 'month':
    case 'month_year':
      return f.value.slice(0, 7)
    default:
      return f.value
  }
}

const lineOut = (line: AnswerLine, name: (n: string) => string) => ({
  say: line.say,
  names: line.names.map(name),
  figures: Object.fromEntries(Object.entries(line.figures).map(([slot, f]) => [slot, figureOut(f)])),
})

function periodOf(input: GetSpendingInput): AskPeriod | null {
  if (input.month !== undefined) return { kind: 'month', month: ASK_MONTHS.indexOf(input.month) + 1, yearsBack: input.year === 'last' ? 1 : 0 }
  return input.period === undefined ? null : { kind: input.period }
}

export async function getSpending(caller: Caller | null, input: GetSpendingInput) {
  if (caller === null) return refusal('server_error')
  // Ask's twelve months back, and the months either side of the server's date.
  const window = monthsAround(utcToday(), 13, 1)
  const read = await rpc(caller, 'ai_app_read', { p_parts: PARTS, p_from: window.from, p_to: window.to })
  if (isRefusal(read)) {
    log('tool_get_spending_refused')
    return refusal(read.refused)
  }
  let result
  try {
    const today = isoDate(String(read['today']))
    // As Ask offers them: Not spending has no figure to ask about.
    const offered = categoriesFrom(read['categories']).filter((c) => c.kind !== 'transfer')
    const ids = (input.categories ?? []).map((n) => offered.find((c) => cleanName(c.name) === n)?.id)
    if (ids.some((id) => id === undefined)) return refusal('unknown_category')
    const query = { intent: input.question, period: periodOf(input), categoryIds: ids as string[], monthlyCents: null }
    // Only the questions about spending are offered, so no forecast, goal or debt is read.
    const got = answerQuery({ ...askInput(read, today), query, forecast: null, goals: [], debts: null })
    const name = input.question === 'top_shops' || input.question === 'subscriptions' ? cleanShop : cleanName
    const out =
      got.status === 'answered'
        ? { status: got.status, now: got.now, before: got.before, cut_from: got.cutFrom, main: lineOut(got.main, name), rows: got.rows.map((r) => lineOut(r, name)) }
        : got.status === 'before_records'
          ? { status: got.status, covered_from: got.coveredFrom }
          : { status: got.status }
    result = { as_of: today, answer: out }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  log('tool_get_spending_ok', { rows: 'rows' in result.answer ? result.answer.rows.length : 0 })
  return answer(result)
}

export function registerGetSpending(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'get_spending',
    { title: 'Ask about spending', description: DESCRIPTION, inputSchema: GetSpendingInputSchema, annotations: READ_ONLY, _meta: SIGNED_IN },
    (input) => getSpending(caller, input),
  )
}
