/**
 * The next 30 days, and the tightest of them (F32, docs/formula-decisions.md;
 * plan slice A13).
 *
 * NOT workbook-derived. From today's real balance, each day adds its
 * paydays and takes its bills and a daily Variable amount, so the owner
 * sees the day money is shortest, usually just before a payday. What it
 * cannot place on a day is named rather than guessed: pay with no schedule,
 * and savings not yet moved. Nothing here is stored.
 */
import { type Cents, type IsoDate, ZERO_CENTS, addDays, cents, daysBetween, sumCents } from '@budget/money-primitives'
import { type MonthForecastInput, monthPosition } from './month-position.js'
import { paydaysIn } from './pay-period.js'
import { plansInEffect } from './period-sheet.js'
import { monthBounds, shiftMonth } from './week.js'

export interface CashFlowBill {
  readonly date: IsoDate
  readonly categoryId: string
  readonly cents: Cents
  /** `not_seen`: its day has come this month with no charge yet, so it counts tomorrow. */
  readonly seen: 'due' | 'not_seen'
}

export interface CashFlowPay {
  readonly date: IsoDate
  readonly categoryId: string
  readonly cents: Cents
}

export interface CashFlow30 {
  /** `no_start`: no balance without a typed start (D17), and the bills still listed. */
  readonly status: 'line' | 'no_start'
  /** Start + the real rows from the 1st to today; null with no start. */
  readonly todayCents: Cents | null
  /** Each of the 30 days after today, with its closing balance; none with no start. */
  readonly days: readonly { readonly date: IsoDate; readonly balanceCents: Cents }[]
  /** The lowest of them, the earliest on a tie; null with no start. */
  readonly lowest: { readonly date: IsoDate; readonly balanceCents: Cents } | null
  readonly pay: readonly CashFlowPay[]
  /** In date order, then the lists' order. */
  readonly bills: readonly CashFlowBill[]
  /** Those due tomorrow to a week from today. */
  readonly billsNext7: readonly CashFlowBill[]
  /** Variable spending a day, from up to 90 days of records; null with under 14. */
  readonly dailyVariableCents: Cents | null
  /** The days of records it rests on. */
  readonly variableDays: number
  /** Savings still planned this month (F30), which the line leaves out. */
  readonly savingsNotMovedCents: Cents
  /** Income sources with no payday to put pay on (F29): not counted, or a goal with no schedule. */
  readonly payLeftOut: readonly string[]
}

const DAYS = 30
const WEEK = 7
const MOST_DAYS = 90
const FEWEST_DAYS = 14
const OWED_ORDER: Readonly<Record<string, number>> = { bill: 0, debt: 1, subscription: 2 }

export function cashFlow30(input: MonthForecastInput): CashFlow30 {
  const { asOf } = input
  const last = addDays(asOf, DAYS)
  const monthStart = monthBounds(asOf).start
  const known = new Map(input.categories.map((c) => [c.id, c]))
  for (const e of input.entries) {
    if (!known.has(e.categoryId)) throw new RangeError(`A ledger row names category ${e.categoryId}, which was not passed in`)
  }
  const position = monthPosition(input)

  // Pay: each scheduled source's paydays, at what F29 says one brings.
  const pay = position.pay.sources.flatMap((source): CashFlowPay[] => {
    const schedule = input.paySchedules.find((s) => s.categoryId === source.categoryId)
    if (schedule === undefined || source.perPaydayCents === null) return []
    const amount = source.perPaydayCents
    return paydaysIn({ schedule, from: addDays(asOf, 1), to: last }).map((date) => ({ date, categoryId: source.categoryId, cents: amount }))
  })

  // Bills: each month the window touches, each amount on its day unless a real charge replaced it (D5).
  const bills: CashFlowBill[] = []
  for (let month = monthStart; month <= last; month = shiftMonth(month, 1)) {
    const { end } = monthBounds(month)
    for (const plan of plansInEffect(input.categories, input.planHistory, month)) {
      if (plan.plannedCents === null) continue
      if (input.entries.some((e) => e.categoryId === plan.categoryId && e.postedOn >= month && e.postedOn <= end)) continue
      const onDay = plan.dueDay === null ? null : dayIn(month, Math.min(plan.dueDay, Number(end.slice(8))))
      const thisMonth = month === monthStart
      const late = thisMonth && (onDay === null || onDay <= asOf)
      const date = late ? addDays(asOf, 1) : (onDay ?? month)
      if (date > asOf && date <= last) bills.push({ date, categoryId: plan.categoryId, cents: cents(plan.plannedCents), seen: late ? 'not_seen' : 'due' })
    }
  }
  const rank = (id: string) => {
    const c = known.get(id)!
    return [OWED_ORDER[c.kind]!, c.sortOrder, c.name] as const
  }
  bills.sort((a, b) => {
    const [x, y] = [rank(a.categoryId), rank(b.categoryId)]
    return a.date < b.date ? -1 : a.date > b.date ? 1 : x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2])
  })

  const daily = dailyVariable(input)
  const start = input.startingBalanceCents
  const today =
    start === null
      ? null
      : sumCents([
          cents(start),
          ...input.entries.filter((e) => e.postedOn >= monthStart && e.postedOn <= asOf && known.get(e.categoryId)?.kind !== 'transfer').map((e) => cents(e.amountCents)),
        ])
  const days: { date: IsoDate; balanceCents: Cents }[] = []
  let balance = today
  for (let k = 1; balance !== null && k <= DAYS; k += 1) {
    const date = addDays(asOf, k)
    const moves = [...pay.filter((p) => p.date === date).map((p) => p.cents), ...bills.filter((b) => b.date === date).map((b) => cents(ZERO_CENTS - b.cents))]
    // With under 14 days of records the daily amount is left out, and said (F32).
    const spend = daily.cents === null ? [] : [cents(ZERO_CENTS - daily.cents)]
    balance = sumCents([balance, ...moves, ...spend])
    days.push({ date, balanceCents: balance })
  }
  const lowest = days.reduce<(typeof days)[number] | null>((low, day) => (low === null || day.balanceCents < low.balanceCents ? day : low), null)

  return {
    status: today === null ? 'no_start' : 'line',
    todayCents: today,
    days,
    lowest,
    pay,
    bills,
    billsNext7: bills.filter((b) => b.date <= addDays(asOf, WEEK)),
    dailyVariableCents: daily.cents,
    variableDays: daily.days,
    savingsNotMovedCents: position.savingsPlannedCents,
    payLeftOut: position.pay.sources.filter((s) => s.basis === 'not_counted' || s.basis === 'goal_left').map((s) => s.categoryId),
  }
}

/** Variable spending over the last min(90, days of records) days ÷ those days, half-up; none under 14. */
function dailyVariable(input: MonthForecastInput): { readonly cents: Cents | null; readonly days: number } {
  if (input.historyStart === null) return { cents: null, days: 0 }
  const from = [input.historyStart, input.readFrom, addDays(input.asOf, 1 - MOST_DAYS)].reduce((a, b) => (a > b ? a : b))
  const days = Math.max(0, daysBetween(from, input.asOf) + 1)
  if (days < FEWEST_DAYS) return { cents: null, days }
  const variable = new Set(input.categories.filter((c) => c.kind === 'variable').map((c) => c.id))
  const net = sumCents(input.entries.filter((e) => variable.has(e.categoryId) && e.postedOn >= from && e.postedOn <= input.asOf).map((e) => cents(e.amountCents)))
  // Spending is below zero on the ledger (D3); refunds past it are nothing spent.
  const spent = net < 0 ? BigInt(-net) : 0n
  return { cents: cents(Number((spent * 2n + BigInt(days)) / (2n * BigInt(days)))), days }
}

function dayIn(month: IsoDate, day: number): IsoDate {
  return `${month.slice(0, 8)}${String(day).padStart(2, '0')}` as IsoDate
}
