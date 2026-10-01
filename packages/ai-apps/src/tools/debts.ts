/**
 * Tool 6, `get_debts` (PLAN §2.4): every debt as the Debts screen shows it.
 * Every figure is core's: each schedule from its own start month
 * (debtPlan), where each debt stands today (debtStatus, F22) and the three
 * payoff plans side by side (payoffStrategies, F23), over the same renaming
 * the app does. Balances follow the schedule typed in the app, not
 * recorded payments, as the Debts screen's do (N53).
 */
import type { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { debtPlan, debtStatus, isoDate, monthBounds, payoffStrategies, type StrategyOutcome } from '@budget/core'
import { GetDebtsInputSchema } from '@budget/schema'
import { log } from '../log.js'
import { cleanName, money } from '../money.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller } from '../rpc.js'
import { debtsFrom } from '../rows.js'
import { utcToday } from '../windows.js'

export type GetDebtsInput = z.output<typeof GetDebtsInputSchema>

export const DESCRIPTION =
  'Every debt with today’s balance on its payoff schedule, minimum, rate, the month it is paid off and progress; ' +
  'the debt-free month and total interest; flat, snowball and avalanche side by side. Balances follow the schedule ' +
  'typed in the app, not recorded payments. Give `debt` for its month-by-month schedule from this month, `months` ' +
  'long. Every amount is {cents, display}; quote display. Returns as_of, debts[], totals, debt_free_month, ' +
  'total_interest, never_paid_off[], strategies{flat, snowball, avalanche}, schedule[]?.'

const month = (date: string) => date.slice(0, 7)

const strategy = (s: StrategyOutcome | null) =>
  s === null
    ? null
    : {
        debt_free_month: month(s.debtFreeDate),
        total_interest: money(s.totalInterestCents),
        paid_off_in: s.paidOffIn.map((p) => ({ name: cleanName(p.name), month: month(p.month) })),
      }

export async function getDebts(caller: Caller | null, input: GetDebtsInput) {
  if (caller === null) return refusal('server_error')
  const day = utcToday()
  const read = await rpc(caller, 'ai_app_read', { p_parts: ['debts'], p_from: day, p_to: day })
  if (isRefusal(read)) {
    log('tool_get_debts_refused')
    return refusal(read.refused)
  }
  let result
  try {
    const today = isoDate(String(read['today']))
    const plan = debtsFrom(read)
    const named = plan.debts.find((d) => cleanName(d.name) === input.debt)
    if (input.debt !== undefined && named === undefined) return refusal('unknown_debt')
    const { amortization, neverPaidOff } = debtPlan(plan)
    const status = amortization === null ? null : debtStatus({ amortization, asOf: today })
    const strategies = payoffStrategies(plan)
    const typed = new Map(plan.debts.map((d) => [d.name, d]))
    const thisMonth = monthBounds(today).start
    const schedule = amortization?.perDebt.find((d) => d.name === named?.name)
    result = {
      as_of: today,
      debts: (status?.debts ?? []).map((d) => ({
        name: cleanName(d.name),
        balance: money(d.balanceCents),
        starting_balance: money(d.startingBalanceCents),
        minimum: money(typed.get(d.name)?.minimumPaymentCents ?? 0),
        apr_bp: typed.get(d.name)?.aprBasisPoints ?? null,
        paid: money(d.paidCents),
        progress_bp: d.progressBp,
        paid_off_month: month(d.paidOffIn),
      })),
      totals:
        status === null || amortization === null
          ? null
          : {
              starting_balance: money(status.totals.startingBalanceCents),
              balance: money(status.totals.balanceCents),
              paid: money(status.totals.paidCents),
              progress_bp: status.totals.progressBp,
              monthly_minimums: money(amortization.totalMinimumPaymentCents),
            },
      debt_free_month: amortization === null ? null : month(amortization.debtFreeDate),
      total_interest: amortization === null ? null : money(amortization.totalInterestCents),
      never_paid_off: neverPaidOff.map(cleanName),
      strategies: strategies === null ? null : { flat: strategy(strategies.flat), snowball: strategy(strategies.snowball), avalanche: strategy(strategies.avalanche) },
      // A debt never paid off has no schedule to give; never_paid_off names it.
      ...(named === undefined
        ? {}
        : {
            schedule: (schedule?.months ?? [])
              .filter((m) => m.date >= thisMonth)
              .slice(0, input.months)
              .map((m) => ({ month: month(m.date), interest: money(m.interestCents), payment: money(m.paymentCents), extra: money(m.extraCents), balance: money(m.balanceCents) })),
          }),
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  log('tool_get_debts_ok', { rows: result.debts.length })
  return answer(result)
}

export function registerGetDebts(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'get_debts',
    { title: 'Debts and payoff', description: DESCRIPTION, inputSchema: GetDebtsInputSchema, annotations: READ_ONLY, _meta: SIGNED_IN },
    (input) => getDebts(caller, input),
  )
}
