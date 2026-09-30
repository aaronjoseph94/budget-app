/**
 * Tool 2, `get_period` (PLAN §2.4): how a month or a week is going, as the
 * Month and the Week show it. Every figure is core's, from the same rows
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
  paycheckSheet,
  payPeriod,
  safeToSpend,
  weekBounds,
  weekSheet,
  type PeriodSheet,
} from '@budget/core'
import type { Cents, IsoDate } from '@budget/money-primitives'
import { GetPeriodInputSchema } from '@budget/schema'
import { log } from '../log.js'
import { cleanName, money } from '../money.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller, type RefusalCode } from '../rpc.js'
import {
  categoriesFrom,
  monthSheetInput,
  paycheckSheetInput,
  paySources,
  pendingIn,
  recordsFrom,
  schedulesFrom,
  weekSheetInput,
  type Read,
} from '../rows.js'
import { monthsAround, utcToday } from '../windows.js'

export type GetPeriodInput = z.output<typeof GetPeriodInputSchema>

export const DESCRIPTION =
  'How a month, week or pay period is going: starting balance, income, spent, saved, left to spend, ending balance; ' +
  'each list’s budget and actual; each category’s budget, actual, what is left and whether it is over, near or under, ' +
  'with this month’s pace. `date` picks the period holding that day (default today); a pay period follows ' +
  'the paydays of `income` (default the first income source with paydays). Charges waiting in Review are ' +
  'not counted; `waiting_in_review` says how many. Every amount is {cents, display}; quote display. ' +
  'Returns as_of, period{kind, from, to, days_left, income?}, summary, lists[], categories[], imported_through, waiting_in_review.'

const LISTS = ['income', 'savings', 'variable', 'bill', 'debt', 'subscription'] as const
/** Where a budget passed is overspending; on Income and Savings more is better, so no standing. */
const SPENDING: ReadonlySet<string> = new Set(['variable', 'bill', 'debt', 'subscription'])

const PARTS = {
  month: ['categories', 'budgets', 'plans', 'txns', 'balances', 'schedules', 'records', 'pending'],
  week: ['categories', 'plans', 'txns', 'records', 'pending'],
  pay_period: ['categories', 'budgets', 'plans', 'txns', 'schedules', 'records', 'pending'],
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

type Shown = {
  readonly sheet: PeriodSheet
  readonly daysLeft: number | null
  readonly paceOf: Pace | null
  /** Whose paydays a pay period follows. */
  readonly income?: string
}

/** What a period is found from: the read, the day asked about, the owner's today and the arguments. */
type Asked = { readonly read: Read; readonly day: IsoDate; readonly today: IsoDate; readonly readFrom: IsoDate; readonly input: GetPeriodInput }

/** The month holding `day`, as the Month shows it; days left (F31) and paces (F28) only while it runs. */
function month({ read, day, today, readFrom }: Asked): Shown {
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

/** The week holding `day`, as the Week shows it: this week counts its days left from today, any other from its Monday. */
function week({ read, day, today }: Asked): Shown {
  const current = weekBounds(day).start === weekBounds(today).start
  const sheet = weekSheet(weekSheetInput(read, current ? today : weekBounds(day).start))
  return { sheet, daysLeft: current ? sheet.daysLeft : null, paceOf: null }
}

/**
 * The pay period holding `day`, as the Paycheck shows it: from the paydays
 * of the income source named, else the first in Setup's order. Core counts
 * no days left in a pay period, so none are given.
 */
function pay_period({ read, day, input }: Asked): Shown | RefusalCode {
  const sources = paySources(read)
  const source = input.income === undefined ? sources[0] : sources.find((s) => cleanName(s.name) === input.income)
  if (source === undefined) return input.income === undefined ? 'no_pay_schedule' : 'unknown_category'
  const { start } = payPeriod({ schedule: source.schedule, asOf: day })
  const sheet = paycheckSheet(paycheckSheetInput(read, start, source.schedule))
  return { sheet, daysLeft: null, paceOf: null, income: cleanName(source.name) }
}

const SHOWN = { month, week, pay_period } as const

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
    const shown = SHOWN[input.period]({ read, day, today, readFrom: window.from, input })
    if (typeof shown === 'string') return refusal(shown)
    const { sheet, daysLeft, paceOf, income } = shown
    result = {
      as_of: today,
      period: { kind: input.period, from: sheet.from, to: sheet.to, days_left: daysLeft, ...(income === undefined ? {} : { income }) },
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
