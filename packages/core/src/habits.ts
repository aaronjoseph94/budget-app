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
import { completeMonths } from './history.js'
import { monthActuals } from './month-actuals.js'
import { type PeriodEntry, type WeekCategory, weekSheet } from './period-sheet.js'
import { goalBars } from './shares.js'
import { median } from './stats.js'
import { monthBounds, shiftMonth, weekBounds } from './week.js'
import { byName } from './order.js'

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

export interface WeekdayAverage {
  /** 1 for Monday to 7 for Sunday. */
  readonly weekday: number
  /** Its spending over the weeks read ÷ their number, half-up; below $0 after refunds. */
  readonly averageCents: Cents
  /** The bar's length (goalBars, F17); null below $0, which no bar can draw. */
  readonly barBp: number | null
  /** The allowance's track on the same scale; null with no weekly budget. */
  readonly trackBp: number | null
}

export type WeekdayPattern =
  | {
      readonly status: 'ready'
      /** Complete weeks read: 4 to 12. */
      readonly weeks: number
      /** The first read week's Monday and the last's Sunday. */
      readonly from: IsoDate
      readonly to: IsoDate
      /** Monday to Sunday. */
      readonly days: readonly WeekdayAverage[]
      /** The weekday with the largest average above $0, the earlier on a tie; null when none is above $0. */
      readonly costliest: number | null
      /** The weekly budgets ÷ 7 the tracks show; null with none set. */
      readonly allowanceCents: Cents | null
    }
  /** Under 4 complete weeks. `possibleFrom` is the Monday a pattern becomes possible; null with no records. */
  | { readonly status: 'not_enough'; readonly weeks: number; readonly possibleFrom: IsoDate | null }

/** Complete weeks read at most, and at least. */
const PATTERN_WEEKS = 12
const PATTERN_NEEDS = 4

/** F40: the average Variable spending on each weekday over the last up to 12 complete weeks. */
export function weekdayPattern(input: HabitsInput): WeekdayPattern {
  const all = completeWeeks(input)
  if (all.status === 'none') return { status: 'not_enough', weeks: 0, possibleFrom: null }
  const starts = all.starts.slice(-PATTERN_WEEKS)
  const n = starts.length
  if (n < PATTERN_NEEDS) {
    // Every week from the first whole one to today's is complete, so the
    // fourth is complete from the Monday four weeks after the first.
    return { status: 'not_enough', weeks: n, possibleFrom: addDays(all.firstWhole, 7 * PATTERN_NEEDS) }
  }
  const daily = dailySpending(input)
  const averages = Array.from({ length: 7 }, (_, i) => {
    const total = sumCents(starts.flatMap((start) => {
      const spent = daily.get(addDays(start, i))
      return spent === undefined ? [] : [spent]
    }))
    return halfUp(BigInt(total), BigInt(n))
  })
  const budgets = budgetAllowance(input.categories)
  const allowanceCents = budgets === null ? null : budgets.cents
  const { bars } = goalBars({ rows: averages.map((a, i) => ({ categoryId: String(i + 1), budgetCents: allowanceCents, actualCents: a })) })
  const top = averages.reduce<number | null>((best, a, i) => (a > 0 && (best === null || a > averages[best]!) ? i : best), null)
  return {
    status: 'ready',
    weeks: n,
    from: starts[0]!,
    to: addDays(starts[n - 1]!, 6),
    days: averages.map((averageCents, i) => ({ weekday: i + 1, averageCents, barBp: bars[i]!.actualBp, trackBp: bars[i]!.goalBp })),
    costliest: top === null ? null : top + 1,
    allowanceCents,
  }
}

export interface KeptWeek {
  /** Its Monday. */
  readonly start: IsoDate
  /** The Week's Left to spend (F5): the Variable weekly budgets less what was spent. */
  readonly leftCents: Cents
  /** At or under its weekly budgets: Left to spend is $0 or more. */
  readonly kept: boolean
}

export type Streaks =
  | {
      readonly status: 'ready'
      /** Every complete week read, oldest first. */
      readonly weeks: readonly KeptWeek[]
      /** Kept weeks in a row, ending with the last complete week. */
      readonly current: number
      /** The longest run of kept weeks read. */
      readonly best: number
      /** The Monday of the best run's last week, the latest of equal runs; null with none. */
      readonly bestEnded: IsoDate | null
    }
  /** No Variable category has a weekly budget, so no week can be kept. */
  | { readonly status: 'no_budget' }

/**
 * F40: complete weeks in a row at or under the Variable weekly budgets, as
 * the Week shows them (weekSheet's Left to spend, F5), judged against
 * today's budgets, since the Week keeps one set for every week (0004).
 */
export function streaks(input: HabitsInput): Streaks {
  if (!input.categories.some((c) => c.kind === 'variable' && c.weeklyBudgetCents !== null)) return { status: 'no_budget' }
  const all = completeWeeks(input)
  const starts = all.status === 'none' ? [] : all.starts
  const weeks = starts.map((start): KeptWeek => {
    // Only the Variable block is read, which no planned bill touches.
    const sheet = weekSheet({ asOf: start, categories: input.categories, entries: input.entries, planHistory: [], statementPeriodEnds: [], startingBalanceCents: null })
    const leftCents = sheet.summary.leftToSpendCents
    return { start, leftCents, kept: leftCents >= 0 }
  })
  let run = 0
  let best = 0
  let bestEnded: IsoDate | null = null
  for (const w of weeks) {
    run = w.kept ? run + 1 : 0
    // At least as long: of equal runs, the latest is named.
    if (run > 0 && run >= best) {
      best = run
      bestEnded = w.start
    }
  }
  return { status: 'ready', weeks, current: run, best, bestEnded }
}

export interface PersonalBestRow {
  readonly categoryId: string
  /** Its Actual in the last complete month, the lowest of the months read. */
  readonly cents: Cents
  /** The next lowest, and its month (the latest of equal ones). */
  readonly nextCents: Cents
  readonly nextMonth: IsoDate
}

export type PersonalBests =
  | {
      readonly status: 'ready'
      /** Complete months read: 3 to 12. */
      readonly months: number
      /** The last complete month, by its first day. */
      readonly month: IsoDate
      /** Furthest under the next lowest first, then the list's order. */
      readonly bests: readonly PersonalBestRow[]
    }
  /** Under 3 complete months. `possibleFrom` is the month a best becomes possible; null with no records. */
  | { readonly status: 'not_enough'; readonly months: number; readonly possibleFrom: IsoDate | null }

const BEST_MONTHS = 12
const BEST_NEEDS = 3
/** F26: under $1.00 either way is the same, so a tie is no best. */
const SAME = 100

/** F40: each Variable category whose last complete month is its lowest of up to 12, by $1.00 or more. */
export function personalBest(input: HabitsInput): PersonalBests {
  const months = completeMonths(input).months.slice(0, BEST_MONTHS)
  const n = months.length
  if (n < BEST_NEEDS) {
    const start = input.historyStart
    if (start === null) return { status: 'not_enough', months: n, possibleFrom: null }
    // As F37 names its month: the later of today's month plus the months
    // still needed, and the records' first whole month plus three.
    const firstWhole = start === monthBounds(start).start ? start : shiftMonth(start, 1)
    const byToday = shiftMonth(input.asOf, BEST_NEEDS - n)
    const byRecords = shiftMonth(firstWhole, BEST_NEEDS)
    return { status: 'not_enough', months: n, possibleFrom: byToday > byRecords ? byToday : byRecords }
  }
  // Newest first, as completeMonths gives them.
  const read = monthActuals({ categories: input.categories, entries: input.entries, months }).months
  const [last, ...earlier] = read
  const bests = input.categories
    .filter((c) => c.kind === 'variable')
    .sort((a, b) => a.sortOrder - b.sortOrder || byName(a.name, b.name))
    .flatMap((c): PersonalBestRow[] => {
      const now = actualOf(last!.actuals, c.id)
      // Newest first, so a strict "lower" keeps the latest of equal months.
      const next = earlier.reduce((low, m) => (actualOf(m.actuals, c.id) < actualOf(low.actuals, c.id) ? m : low))
      const nextCents = actualOf(next.actuals, c.id)
      return nextCents - now >= SAME ? [{ categoryId: c.id, cents: now, nextCents, nextMonth: next.month }] : []
    })
  // A stable sort, so equal savings keep the list's order.
  bests.sort((a, b) => b.nextCents - b.cents - (a.nextCents - a.cents))
  return { status: 'ready', months: n, month: last!.month, bests }
}

/** monthActuals lists every category given, so this cannot miss. */
function actualOf(actuals: ReadonlyMap<string, Cents>, categoryId: string): Cents {
  const actual = actuals.get(categoryId)
  if (actual === undefined) throw new RangeError(`Category ${categoryId} is missing from the months read`)
  return actual
}

/**
 * Every complete week's Monday, oldest first (F40): wholly inside the
 * records covered, and ended before asOf's week began. `firstWhole` is the
 * first Monday on or after the records start.
 */
function completeWeeks(input: HabitsInput): { readonly status: 'none' } | { readonly status: 'some'; readonly starts: readonly IsoDate[]; readonly firstWhole: IsoDate } {
  const covered = coveredFrom(input)
  if (covered === null) return { status: 'none' }
  const monday = weekBounds(covered).start
  const firstWhole = monday === covered ? covered : addDays(monday, 7)
  const thisWeek = weekBounds(input.asOf).start
  const count = firstWhole < thisWeek ? daysBetween(firstWhole, thisWeek) / 7 : 0
  return { status: 'some', starts: Array.from({ length: count }, (_, i) => addDays(firstWhole, 7 * i)), firstWhole }
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
