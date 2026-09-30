/**
 * Tool 2, `get_period` (PLAN §2.4): how a month is going, as the Month
 * shows it. Every figure is core's, from the same rows
 * renamed as the screens rename them; this only picks the period and
 * hands the figures out with the app's own display words.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import {
  budgetStanding,
  budgetUsedBp,
  categoryPace,
  isoDate,
  monthBounds,
  monthSheet,
  safeToSpend,
  type PeriodSheet,
} from '@budget/core'
import type { Cents, IsoDate } from '@budget/money-primitives'
import { GetPeriodInputSchema } from '@budget/schema'
import { log } from '../log.js'
import { cleanName, money } from '../money.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller } from '../rpc.js'
import { categoriesFrom, monthSheetInput, pendingIn, recordsFrom, schedulesFrom, type Read } from '../rows.js'
import { monthsAround, utcToday } from '../windows.js'

export type GetPeriodInput = z.output<typeof GetPeriodInputSchema>

export const DESCRIPTION =
  'How a month is going: starting balance, income, spent, saved, left to spend, ending balance; ' +
  'each list’s budget and actual; each category’s budget, actual, what is left and whether it is over, near or under, ' +
  'with this month’s pace. `date` picks the period holding that day (default today). Charges waiting in Review are ' +
  'not counted; `waiting_in_review` says how many. Every amount is {cents, display}; quote display. ' +
  'Returns as_of, period{kind, from, to, days_left}, summary, lists[], categories[], imported_through, waiting_in_review.'

const LISTS = ['income', 'savings', 'variable', 'bill', 'debt', 'subscription'] as const
/** Where a budget passed is overspending; on Income and Savings more is better, so no standing. */
const SPENDING: ReadonlySet<string> = new Set(['variable', 'bill', 'debt', 'subscription'])

const PARTS = {
  month: ['categories', 'budgets', 'plans', 'txns', 'balances', 'schedules', 'records', 'pending'],
} as const

type Pace = (actual: Cents, budget: Cents | null) => ReturnType<typeof categoryPace>

const maybe = (c: number | null) => (c === null ? null : money(c))

/** The figures an AI app is given for one sheet, narrowed to a list or some categories. */
function figures(sheet: PeriodSheet, input: GetPeriodInput, paceOf: Pace | null) {
  const lists = LISTS.filter((l) => input.list === undefined || l === input.list)
  const wanted = input.categories === undefined ? null : new Set(input.categories)
  const s = sheet.summary
  return {
    summary: {
      starting_balance: maybe(s.startingBalanceCents),
      income: money(s.incomeCents),
      spent: money(s.spentCents),
      saved: money(s.savedCents),
      left_to_spend: money(s.leftToSpendCents),
      ending_balance: maybe(s.endingBalanceCents),
      card_payments_left_out: money(sheet.transfersCents),
    },
    lists: lists.map((list) => {
      const block = sheet.blocks[list]
      const budgeted = block.rows.some((r) => r.effectiveBudgetCents !== null)
      return {
        list,
        budget: budgeted ? money(block.effectiveBudgetTotalCents) : null,
        actual: money(block.actualTotalCents),
        used_bp: budgetUsedBp({ actualCents: block.actualTotalCents, budgetCents: block.effectiveBudgetTotalCents }).usedBp,
        // A list-level Left only where the Month shows one (F5, F16).
        left: list === 'variable' ? money(sheet.blocks.variable.remainingTotalCents) : null,
      }
    }),
    categories: lists.flatMap((list) =>
      sheet.blocks[list].rows
        .map((r) => ({ r, name: cleanName(r.name) }))
        .filter(({ name }) => wanted === null || wanted.has(name))
        .map(({ r, name }) => {
          const pace = list === 'variable' && paceOf !== null ? paceOf(r.actualCents, r.budgetCents) : null
          return {
            name,
            list,
            budget: maybe(r.effectiveBudgetCents),
            actual: money(r.actualCents),
            left: maybe(r.remainingCents),
            standing: SPENDING.has(list) ? budgetStanding({ actualCents: r.actualCents, budgetCents: r.effectiveBudgetCents }).standing : null,
            ...(pace === null || pace.paceCents === null ? {} : { pace: { pace: money(pace.paceCents), over: maybe(pace.overCents) } }),
          }
        }),
    ),
  }
}

type Shown = { readonly sheet: PeriodSheet; readonly daysLeft: number | null; readonly paceOf: Pace | null }

/** The month holding `day`, as the Month shows it; days left (F31) and paces (F28) only while it runs. */
function month(read: Read, day: IsoDate, today: IsoDate, readFrom: IsoDate): Shown {
  const start = monthBounds(day).start
  const input = monthSheetInput(read, start)
  const sheet = monthSheet(input)
  if (monthBounds(today).start !== start) return { sheet, daysLeft: null, paceOf: null }
  const { historyStart } = recordsFrom(read['records'])
  const paySchedules = schedulesFrom(read['schedules'])
  return {
    sheet,
    daysLeft: safeToSpend({ ...input, asOf: today, historyStart, readFrom, paySchedules }).days,
    paceOf: (actual, budget) => categoryPace({ asOf: today, month: start, actualCents: actual, budgetCents: budget }),
  }
}

const SHOWN = { month } as const

export async function getPeriod(caller: Caller | null, input: GetPeriodInput) {
  if (caller === null) return refusal('server_error')
  const window = monthsAround(input.date === undefined ? utcToday() : isoDate(input.date), 1, 1)
  const read = await rpc(caller, 'ai_app_read', { p_parts: PARTS[input.period], p_from: window.from, p_to: window.to })
  if (isRefusal(read)) {
    log('tool_get_period_refused')
    return refusal(read.refused)
  }
  let result
  try {
    const today = isoDate(String(read['today']))
    const day = input.date === undefined ? today : isoDate(input.date)
    const known = new Set(categoriesFrom(read['categories']).map((c) => cleanName(c.name)))
    if (input.categories?.some((n) => !known.has(n)) === true) return refusal('unknown_category')
    const { sheet, daysLeft, paceOf } = SHOWN[input.period](read, day, today, window.from)
    result = {
      as_of: today,
      period: { kind: input.period, from: sheet.from, to: sheet.to, days_left: daysLeft },
      ...figures(sheet, input, paceOf),
      imported_through: sheet.importedThrough,
      waiting_in_review: pendingIn(read['pending'], sheet.from, sheet.to),
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  log('tool_get_period_ok', { rows: result.categories.length })
  return answer(result)
}

export function registerGetPeriod(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'get_period',
    { title: 'How a period is going', description: DESCRIPTION, inputSchema: GetPeriodInputSchema, annotations: READ_ONLY, _meta: SIGNED_IN },
    (input) => getPeriod(caller, input),
  )
}
