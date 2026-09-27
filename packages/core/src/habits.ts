/**
 * Habits: everyday spending day by day, which weekday costs most, weeks
 * kept within budget and a category's best month (F40,
 * docs/formula-decisions.md; plan §2.6, §7).
 *
 * The workbook has no day-by-day view, so nothing here has a cached value;
 * the tests are worked by hand. Everyday spending is the Variable expenses
 * list, net of refunds, as the Month's Actual counts it. A day before the
 * records covered is "no records" and a day after asOf "to come", never
 * $0, so the grid never shows a thrift that was only a gap. Nothing is
 * stored: it is recomputed from the ledger on every read.
 */
import { type Cents, type IsoDate, ZERO_CENTS, addDays, cents, daysBetween, sumCents } from '@budget/money-primitives'
import type { PeriodEntry, WeekCategory } from './period-sheet.js'
import { median } from './stats.js'
import { weekBounds } from './week.js'

export interface HabitsInput {
  /** Today: its week is the grid's last, and never complete. */
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers: a day before it was not read, and is not $0. */
  readonly readFrom: IsoDate
  /** Every category the entries name, each with its one weekly budget (0004). */
  readonly categories: readonly WeekCategory[]
  readonly entries: readonly PeriodEntry[]
}

export type GridLevel = 'none' | 'half' | 'all' | 'one_and_half' | 'more'

export interface GridDay {
  readonly date: IsoDate
  readonly status: 'recorded' | 'no_records' | 'to_come'
  /** Variable spending, net; below $0 after a refund. Null when not recorded. */
  readonly spentCents: Cents | null
  readonly level: GridLevel | null
}

export interface GridWeek {
  /** Its Monday. */
  readonly start: IsoDate
  /** Monday to Sunday. */
  readonly days: readonly GridDay[]
  /** Its recorded days' spending. */
  readonly spentCents: Cents
  readonly noSpendDays: number
}

export interface DailyAllowance {
  readonly cents: Cents | null
  /** The weekly budgets ÷ 7; the median day that had spending, with none set; or nothing to go on. */
  readonly from: 'budgets' | 'usual_day' | 'none'
}

export interface SpendingGrid {
  /** Oldest first, up to 26, the last holding asOf. None with no records. */
  readonly weeks: readonly GridWeek[]
  readonly allowance: DailyAllowance
  readonly recordedDays: number
  readonly noSpendDays: number
  /** Recorded days at each level. */
  readonly levels: Readonly<Record<GridLevel, number>>
}

/** Up to this many weeks, asOf's included. */
const GRID_WEEKS = 26

/**
 * A day's level against the allowance A (F40), in whole cents: none at $0
 * or less, then up to half, up to all, up to one and a half, and more. Each
 * boundary belongs to the lower level.
 */
export function gridLevel(input: { readonly spentCents: number; readonly allowanceCents: number }): GridLevel {
  const spent = BigInt(cents(input.spentCents))
  const a = BigInt(cents(input.allowanceCents))
  if (spent <= 0n) return 'none'
  if (2n * spent <= a) return 'half'
  if (spent <= a) return 'all'
  if (2n * spent <= 3n * a) return 'one_and_half'
  return 'more'
}

export function spendingGrid(input: HabitsInput): SpendingGrid {
  const covered = coveredFrom(input)
  const daily = dailySpending(input)
  const levels: Record<GridLevel, number> = { none: 0, half: 0, all: 0, one_and_half: 0, more: 0 }
  if (covered === null) return { weeks: [], allowance: budgetAllowance(input.categories) ?? { cents: null, from: 'none' }, recordedDays: 0, noSpendDays: 0, levels }

  const last = weekBounds(input.asOf).start
  const earliest = addDays(last, -7 * (GRID_WEEKS - 1))
  const first = weekBounds(covered).start > earliest ? weekBounds(covered).start : earliest
  const recorded = (date: IsoDate) => date >= covered && date <= input.asOf
  const starts = Array.from({ length: daysBetween(first, last) / 7 + 1 }, (_, i) => addDays(first, 7 * i))
  // A recorded day with no Variable row is a day nothing was spent: a real $0, not a gap.
  const spentOn = (date: IsoDate): Cents => {
    const spent = daily.get(date)
    return spent === undefined ? ZERO_CENTS : spent
  }

  const allowance = budgetAllowance(input.categories) ?? usualDay(starts.flatMap((s) => week(s).filter(recorded).map(spentOn)))
  const weeks = starts.map((start): GridWeek => {
    const days = week(start).map((date): GridDay => {
      if (!recorded(date)) return { date, status: date < covered ? 'no_records' : 'to_come', spentCents: null, level: null }
      const spentCents = spentOn(date)
      const level = allowance.cents === null ? 'none' : gridLevel({ spentCents, allowanceCents: allowance.cents })
      levels[level]++
      return { date, status: 'recorded', spentCents, level }
    })
    const counted = days.flatMap((x) => (x.spentCents === null ? [] : [x.spentCents]))
    return { start, days, spentCents: sumCents(counted), noSpendDays: days.filter((x) => x.level === 'none').length }
  })
  const recordedDays = weeks.reduce((n, w) => n + w.days.filter((x) => x.status === 'recorded').length, 0)
  return { weeks, allowance, recordedDays, noSpendDays: levels.none, levels }
}

/** The first day the records cover: the later of history start and the first day read (F38). */
function coveredFrom(input: HabitsInput): IsoDate | null {
  const start = input.historyStart
  if (start === null) return null
  return start > input.readFrom ? start : input.readFrom
}

/** Each day's Variable spending, net: what was spent is the negated net of its rows (D3). */
function dailySpending(input: HabitsInput): Map<IsoDate, Cents> {
  const kinds = new Map(input.categories.map((c) => [c.id, c.kind]))
  const nets = new Map<IsoDate, Cents[]>()
  for (const e of input.entries) {
    const kind = kinds.get(e.categoryId)
    // Refused, as periodSheet refuses it: a charge missing from every day is a grid that looks right and is not.
    if (kind === undefined) throw new RangeError(`A ledger row names category ${e.categoryId}, which was not passed in`)
    const amount = cents(e.amountCents)
    if (kind !== 'variable') continue
    const day = nets.get(e.postedOn)
    if (day === undefined) nets.set(e.postedOn, [amount])
    else day.push(amount)
  }
  // Subtracted from zero, not negated: -0 is not the 0 a purchase and its full refund make.
  return new Map([...nets].map(([date, rows]) => [date, cents(ZERO_CENTS - sumCents(rows))]))
}

/** The Variable weekly budgets set ÷ 7, half-up; none when no Variable category has one. A $0 budget counts. */
function budgetAllowance(categories: readonly WeekCategory[]): DailyAllowance | null {
  const set = categories.flatMap((c) => (c.kind === 'variable' && c.weeklyBudgetCents !== null ? [cents(c.weeklyBudgetCents)] : []))
  if (set.length === 0) return null
  return { cents: halfUp(BigInt(sumCents(set)), 7n), from: 'budgets' }
}

/** With no budget: F27's median of the days that had spending, so a few shopping days are not all "more". */
function usualDay(spent: readonly Cents[]): DailyAllowance {
  const usual = median({ values: spent.filter((s) => s > 0) })
  return usual === null ? { cents: null, from: 'none' } : { cents: cents(usual), from: 'usual_day' }
}

/** `n ÷ by`, half-up on the magnitude, as F26 rounds. */
function halfUp(n: bigint, by: bigint): Cents {
  const size = n < 0n ? -n : n
  const q = (2n * size + by) / (2n * by)
  return cents(Number(n < 0n ? -q : q))
}

/** The seven days from a Monday. */
function week(start: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}
