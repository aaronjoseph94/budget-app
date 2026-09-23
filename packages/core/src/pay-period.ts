/**
 * A pay period, found from an income source's pay schedule, and a monthly
 * amount's share of one (formula decision F15, option B; D18).
 *
 * Workbook's Paycheck Budget types its start and end (D6, D7) and halves a
 * monthly bill with a fixed ÷ 2 (E22 `=IF(F22, E50 / 2, D50)`), never reading
 * the first pay date and frequency START HERE asks for (C8:C14, E8:E14). The
 * owner chose to find the period from those instead, and to divide by how
 * often they are paid. Nothing here is stored: a schedule is typed input
 * (migration 0011), and every period is worked out from it on each read.
 *
 * Excel semantics (docs/formula-decisions.md F15):
 *
 * - A period runs from one payday up to the day before the next, as
 *   Paycheck!D7's note asks ("the Date prior to your next paycheck").
 * - Weekly and bi-weekly paydays fall every 7 or 14 days from the first.
 *   Monthly ones fall on the first payday's day of each month, and on a
 *   short month's last day when it lacks that day, as D6 treats a due day.
 *   Each is counted from the first payday, never from the one before, so a
 *   31st paid on 28 February is paid on 31 March again (EDATE's clamp).
 * - The schedule runs back past the first payday as well as forward.
 * - A share is × 12 ÷ 52, × 12 ÷ 26 or × 1 of a monthly amount, the owner's
 *   4.333 and 2.1667 exactly, in integer cents rounded half-up to the cent.
 *   With these divisors a half cent cannot arise, so it is also the nearest.
 */
import { type Cents, type IsoDate, addDays, addMonths, cents, daysBetween } from '@budget/money-primitives'

/** How often an income source pays, as 0011's `pay_frequency` names it (START HERE!E8's list). */
export type PayFrequency = 'weekly' | 'biweekly' | 'monthly'

export interface PaySchedule {
  /** A payday the others are counted from (START HERE!C8). */
  readonly firstPayDate: IsoDate
  readonly frequency: PayFrequency
}

export interface PayPeriod {
  /** The payday, included. */
  readonly start: IsoDate
  /** The day before the next payday, included (F4). */
  readonly end: IsoDate
}

/** Paydays a year: what a monthly amount's twelve months are shared across. */
export const PAYDAYS_A_YEAR: Readonly<Record<PayFrequency, number>> = { weekly: 52, biweekly: 26, monthly: 12 }

const DAYS_APART: Readonly<Record<Exclude<PayFrequency, 'monthly'>, number>> = { weekly: 7, biweekly: 14 }

/** The nth payday from the first; n below zero runs back. */
function payday(schedule: PaySchedule, n: number): IsoDate {
  return schedule.frequency === 'monthly'
    ? addMonths(schedule.firstPayDate, n)
    : addDays(schedule.firstPayDate, n * DAYS_APART[schedule.frequency])
}

/** Which payday, counted from the first, starts the period holding `asOf`. */
function indexOf(schedule: PaySchedule, asOf: IsoDate): number {
  if (schedule.frequency !== 'monthly') {
    return Math.floor(daysBetween(schedule.firstPayDate, asOf) / DAYS_APART[schedule.frequency])
  }
  const monthOf = (d: IsoDate) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))
  const n = monthOf(asOf) - monthOf(schedule.firstPayDate)
  // In asOf's own month the payday may still be ahead: then the period
  // began in the month before.
  return payday(schedule, n) > asOf ? n - 1 : n
}

function periodAt(schedule: PaySchedule, n: number): PayPeriod {
  return { start: payday(schedule, n), end: addDays(payday(schedule, n + 1), -1) }
}

/** The pay period holding `asOf`. */
export function payPeriod(input: { readonly schedule: PaySchedule; readonly asOf: IsoDate }): PayPeriod {
  return periodAt(input.schedule, indexOf(input.schedule, input.asOf))
}

/** The pay period `periods` away from the one holding `asOf`: −1 is the one before. */
export function shiftPayPeriod(input: {
  readonly schedule: PaySchedule
  readonly asOf: IsoDate
  readonly periods: number
}): PayPeriod {
  return periodAt(input.schedule, indexOf(input.schedule, input.asOf) + input.periods)
}

/**
 * A monthly amount's share of one pay period (F15): × 12 ÷ paydays a year,
 * half-up to the cent. Taken in BigInt, since the product can pass the
 * largest integer a double holds. Amounts and budgets are never below zero
 * (0008, 0009), so one that is is refused rather than rounded some way.
 */
export function payShare(input: { readonly monthlyCents: number; readonly frequency: PayFrequency }): Cents {
  const monthly = cents(input.monthlyCents)
  if (monthly < 0) throw new RangeError(`A monthly amount to share cannot be negative, received ${monthly}`)
  const paydays = BigInt(PAYDAYS_A_YEAR[input.frequency])
  return cents(Number((BigInt(monthly) * 24n + paydays) / (2n * paydays)))
}
