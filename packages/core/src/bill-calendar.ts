/**
 * Workbook's Bill Calendar: one month, Sunday first, with what is due each day,
 * who is paid that day, and a total for each week and for the month.
 *
 * Workbook types a month (Bill Calendar!G3) and lays its days out under the
 * weekday headings B6:N6, "S U N D A Y" first: day 1 under G3's weekday
 * (H8), each day one to the right of the one before (J8), a new week band
 * every seven (B14), and nothing past the month's last day (L32 is 31 in
 * January, N32 is blank). Under each day it FILTERs its Bills tab for every
 * bill whose Day Paid is that day, and every logged payment dated that day
 * (H9), and names START HERE's income sources paid that day (M14). This
 * does the same from the app's monthly amounts (0009), ledger and pay
 * schedules (0011). Nothing here is stored: the screen asks again on every read
 * (CLAUDE.md, never persist a derived money value).
 *
 * Excel semantics (docs/formula-decisions.md F20):
 *
 * - D5, planned against real. A bill, debt or subscription with any real
 *   row in the month shows each row on its own date, and its monthly amount
 *   is not shown that month (owner's decision 3). With none, the amount in
 *   effect that month (D13) shows on its due day. Workbook shows both.
 * - A monthly amount with no day paid is on no day and in no total, as a
 *   blank Bills!B7 matches no day; it is returned as `undated`, so the
 *   screen can say so.
 * - D6 and D21: a due day the month lacks shows on its last day, and so
 *   does a monthly payday (EDATE's clamp, as payPeriod counts one).
 * - D19 and D20: every day reads the same bills (Workbook's B9 reads a wrongly
 *   sized range), and holds all of them and every payday (Workbook's day holds
 *   five bills and one payday name).
 * - Paydays: an Income category's schedule, from its first pay date on
 *   (`C <= date`), every 7 or 14 days, or monthly on the first pay date's
 *   day, named and never with an amount. A schedule left on a category
 *   moved off Income pays nobody (N27).
 * - Q8, a week's total, adds its days; J3, the month's, adds its weeks. The
 *   calendar has as many weeks as the month touches, four to six; Workbook
 *   always draws six bands and leaves the spare ones blank.
 *
 * Signs (D3): a real row is shown as Workbook shows a payment, positive when
 * money went out, and a refund keeps its minus sign (D8).
 */
import { type Cents, type IsoDate, ZERO_CENTS, addMonths, cents, daysBetween, sumCents } from '@budget/money-primitives'
import type { PayFrequency } from './pay-period.js'
import type { PeriodCategory, PeriodEntry } from './period-sheet.js'
import { type PlanHistoryRow, resolvePlans } from './plans.js'
import { type CategoryKind, monthBounds } from './week.js'

export interface CalendarPaySchedule {
  readonly categoryId: string
  /** START HERE!C8: the first payday; there are none before it. */
  readonly firstPayDate: IsoDate
  readonly frequency: PayFrequency
}

export interface BillCalendarInput {
  /** Any day of the month to lay out (G3). */
  readonly month: IsoDate
  readonly categories: readonly PeriodCategory[]
  /** Every monthly amount and day paid typed, for any month (0009). */
  readonly planHistory: readonly PlanHistoryRow[]
  /** Ledger rows; those outside the month, or on other lists, are on no day. */
  readonly entries: readonly PeriodEntry[]
  /** Every pay schedule (0011). */
  readonly paySchedules: readonly CalendarPaySchedule[]
}

export type OwedKind = Extract<CategoryKind, 'bill' | 'debt' | 'subscription'>

export interface CalendarBill {
  readonly categoryId: string
  readonly name: string
  readonly kind: OwedKind
  /** Positive when money went out; below zero for a refund. */
  readonly amountCents: Cents
  /** A ledger row, or the monthly amount standing in for one (D5). */
  readonly basis: 'real' | 'planned'
}

export interface Payday {
  readonly categoryId: string
  readonly name: string
}

export interface CalendarDay {
  readonly date: IsoDate
  /** Day of the month, 1–31. */
  readonly day: number
  readonly bills: readonly CalendarBill[]
  /** Income sources paid that day, in Setup's order. */
  readonly paydays: readonly Payday[]
}

export interface CalendarWeek {
  /** Seven places, Sunday first; null where the day is in another month. */
  readonly days: readonly (CalendarDay | null)[]
  readonly totalCents: Cents
}

export interface BillCalendar {
  /** The month's first day. */
  readonly month: IsoDate
  readonly weeks: readonly CalendarWeek[]
  readonly totalCents: Cents
  /** Monthly amounts in effect with no day paid, and no real row this month: on no day, in no total. */
  readonly undated: readonly CalendarBill[]
}

/** Workbook's own first Sunday: Bill Calendar!B14 is 5 January 2025. */
const A_SUNDAY = '2025-01-05' as IsoDate
const LIST_ORDER: Readonly<Record<OwedKind, number>> = { bill: 0, debt: 1, subscription: 2 }

const DAYS_APART: Readonly<Record<Exclude<PayFrequency, 'monthly'>, number>> = { weekly: 7, biweekly: 14 }

const isOwed = (kind: CategoryKind): kind is OwedKind => kind in LIST_ORDER

export function billCalendar(input: BillCalendarInput): BillCalendar {
  const { start, end } = monthBounds(input.month)
  const last = Number(end.slice(8))
  const known = new Map(input.categories.map((c) => [c.id, c]))
  // Workbook's stack within a day (H9): Bills, then Debts, then Subscriptions,
  // each in Setup's order; paydays in Income's.
  const inOrder = [...input.categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const owed = inOrder
    .flatMap((c) => (isOwed(c.kind) ? [{ ...c, kind: c.kind }] : []))
    .sort((a, b) => LIST_ORDER[a.kind] - LIST_ORDER[b.kind])

  // Refused rather than dropped, as the Month refuses them: a charge or an
  // amount naming a category that was not passed in is a screen whose reads
  // happened at different moments, and a day missing a bill looks right.
  for (const row of input.planHistory) {
    if (!known.has(row.categoryId)) {
      throw new RangeError(`A monthly amount names category ${row.categoryId}, which was not passed in`)
    }
  }
  const onDay = new Map<string, Cents[]>()
  const paidReal = new Set<string>()
  for (const e of input.entries) {
    const category = known.get(e.categoryId)
    if (category === undefined) {
      throw new RangeError(`A ledger row names category ${e.categoryId}, which was not passed in`)
    }
    const amount = cents(e.amountCents)
    if (e.postedOn < start || e.postedOn > end || !isOwed(category.kind)) continue
    paidReal.add(category.id)
    push(onDay, `${category.id}|${Number(e.postedOn.slice(8))}`, cents(ZERO_CENTS - amount))
  }

  // D5: a monthly amount only where no real row this month replaces it.
  const plans = new Map<string, { cents: Cents; dueDay: number | null }>()
  for (const plan of resolvePlans({ asOf: start, history: input.planHistory }).plans) {
    if (plan.plannedCents === null || paidReal.has(plan.categoryId)) continue
    plans.set(plan.categoryId, { cents: plan.plannedCents, dueDay: plan.dueDay })
  }

  for (const s of input.paySchedules) {
    if (!known.has(s.categoryId)) {
      throw new RangeError(`A pay schedule names category ${s.categoryId}, which was not passed in`)
    }
  }
  const incomes = inOrder.flatMap((c) => {
    // N27: a schedule left on a category moved off Income pays nobody.
    const schedule = c.kind === 'income' ? input.paySchedules.find((s) => s.categoryId === c.id) : undefined
    return schedule === undefined ? [] : [{ schedule, payday: { categoryId: c.id, name: c.name } }]
  })

  const dayOf = (day: number): CalendarDay => {
    const date = `${start.slice(0, 8)}${String(day).padStart(2, '0')}` as IsoDate
    const bills = owed.flatMap((c): CalendarBill[] => {
      const plan = plans.get(c.id)
      // D6 and D21: a due day the month lacks is its last day.
      if (plan !== undefined && plan.dueDay !== null && Math.min(plan.dueDay, last) === day) {
        return [{ categoryId: c.id, name: c.name, kind: c.kind, amountCents: plan.cents, basis: 'planned' }]
      }
      const rows = onDay.get(`${c.id}|${day}`)
      if (rows === undefined) return []
      return rows.map((amountCents) => ({ categoryId: c.id, name: c.name, kind: c.kind, amountCents, basis: 'real' }))
    })
    const paydays = incomes.filter(({ schedule }) => paysOn(schedule, date)).map(({ payday }) => payday)
    return { date, day, bills, paydays }
  }

  // Places before the 1st are blank, as B8:F8 are when G3 is a Wednesday.
  const lead = ((daysBetween(A_SUNDAY, start) % 7) + 7) % 7
  const weeks: CalendarWeek[] = []
  for (let first = 1 - lead; first <= last; first += 7) {
    const days = Array.from({ length: 7 }, (_, i) => first + i).map((d) => (d >= 1 && d <= last ? dayOf(d) : null))
    const totalCents = sumCents(days.flatMap((d) => (d === null ? [] : d.bills.map((b) => b.amountCents))))
    weeks.push({ days, totalCents })
  }
  const undated = owed.flatMap((c): CalendarBill[] => {
    const plan = plans.get(c.id)
    return plan === undefined || plan.dueDay !== null
      ? []
      : [{ categoryId: c.id, name: c.name, kind: c.kind, amountCents: plan.cents, basis: 'planned' }]
  })

  return { month: start, weeks, totalCents: sumCents(weeks.map((w) => w.totalCents)), undated }
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key)
  if (list === undefined) map.set(key, [value])
  else list.push(value)
}

/** Whether a schedule pays on `date`: from the first pay date on, as `C <= date` asks. */
function paysOn(schedule: CalendarPaySchedule, date: IsoDate): boolean {
  const since = daysBetween(schedule.firstPayDate, date)
  if (since < 0) return false
  if (schedule.frequency !== 'monthly') return since % DAYS_APART[schedule.frequency] === 0
  // Counted from the first payday each time, never from the one before, so
  // a 31st paid on 28 February is paid on 31 March again (EDATE, as F15).
  const months =
    (Number(date.slice(0, 4)) - Number(schedule.firstPayDate.slice(0, 4))) * 12 +
    Number(date.slice(5, 7)) -
    Number(schedule.firstPayDate.slice(5, 7))
  return addMonths(schedule.firstPayDate, months) === date
}
