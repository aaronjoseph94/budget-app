/**
 * This period beside the one before it (F24, F25, F26; docs/formula-decisions.md).
 *
 * The workbook's tabs each hold one period and refer to no other, so none of
 * this has a cached value; it is D26, and the tests are worked by hand.
 *
 * Like for like: a month, week, pay period or Year still running is set
 * against the same days of the one before, never against a whole one, and
 * one already over against the whole one before. Nothing is compared across
 * the start of the records (F24), because a month missing from them is not
 * a month of $0.
 */
import { type Cents, type IsoDate, addDays, addMonths, daysBetween, subCents, sumCents } from '@budget/money-primitives'
import {
  type PeriodCategory,
  type PeriodEntry,
  type PeriodPlan,
  type PeriodSheet,
  payPlans,
  periodSheet,
  plansInEffect,
} from './period-sheet.js'
import type { PlanHistoryRow } from './plans.js'
import { type PaySchedule, payPeriod, shiftPayPeriod } from './pay-period.js'
import { monthBounds, shiftMonth, weekBounds } from './week.js'

/** Both ends included, as periodSheet reads a window (F4). */
export interface DateWindow {
  readonly from: IsoDate
  readonly to: IsoDate
}

/** Which period is shown, named by any of its days (a Year by its first month). */
export type ComparedPeriod =
  | { readonly period: 'month'; readonly month: IsoDate }
  /** Monday to Sunday (D14). */
  | { readonly period: 'week'; readonly week: IsoDate }
  /** The pay period holding `day`, from the income source's schedule (F15). */
  | { readonly period: 'pay'; readonly schedule: PaySchedule; readonly day: IsoDate }
  /** Twelve months from `startMonth` (F14). */
  | { readonly period: 'year'; readonly startMonth: IsoDate }

export type ComparisonWindowInput = ComparedPeriod & {
  /** Today: which period is running, and how far into it. */
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
}

export type ComparisonWindow =
  | {
      readonly status: 'compared'
      /** True while the period runs: both windows stop as far in as asOf. */
      readonly sameDays: boolean
      readonly now: DateWindow
      readonly before: DateWindow
    }
  /** The period has not begun, so there is nothing yet to compare. */
  | { readonly status: 'not_started' }
  /** The earlier window starts before the records, so it is left out (F24). */
  | {
      readonly status: 'before_records'
      readonly now: DateWindow
      readonly before: DateWindow
      readonly historyStart: IsoDate | null
    }

interface Bounds {
  readonly start: IsoDate
  readonly end: IsoDate
}

/** The period shown, the one before it, and how far into that one asOf's day falls. */
interface Spans {
  readonly shown: Bounds
  readonly previous: Bounds
  /** The earlier window's last day while the period runs, before it is capped at that period's end. */
  readonly sameDayBefore: IsoDate
}

function spans(input: ComparisonWindowInput): Spans {
  const { asOf } = input
  switch (input.period) {
    case 'month': {
      const shown = monthBounds(input.month)
      const previous = monthBounds(shiftMonth(shown.start, -1))
      // Days 1..d: a short month's window is capped at its end below.
      return { shown, previous, sameDayBefore: addDays(previous.start, Number(asOf.slice(8)) - 1) }
    }
    case 'week': {
      const shown = weekBounds(input.week)
      return { shown, previous: weekBounds(addDays(shown.start, -7)), sameDayBefore: addDays(asOf, -7) }
    }
    case 'pay': {
      const shown = payPeriod({ schedule: input.schedule, asOf: input.day })
      const previous = shiftPayPeriod({ schedule: input.schedule, asOf: input.day, periods: -1 })
      return { shown, previous, sameDayBefore: addDays(previous.start, daysBetween(shown.start, asOf)) }
    }
    case 'year': {
      const start = monthBounds(input.startMonth).start
      const shown = { start, end: monthBounds(shiftMonth(start, 11)).end }
      const previous = { start: shiftMonth(start, -12), end: addDays(start, -1) }
      // addMonths ends a 29 February the year before lacks on the 28th.
      return { shown, previous, sameDayBefore: addMonths(asOf, -12) }
    }
  }
}

/** F25: a period against the one before it, like for like, inside the records (F24). */
export function comparisonWindow(input: ComparisonWindowInput): ComparisonWindow {
  const { shown, previous, sameDayBefore } = spans(input)
  if (shown.start > input.asOf) return { status: 'not_started' }
  const running = input.asOf <= shown.end
  const now = { from: shown.start, to: running ? input.asOf : shown.end }
  // The earlier window ends with its period rather than running on into the next.
  const before = { from: previous.start, to: running && sameDayBefore < previous.end ? sameDayBefore : previous.end }
  if (input.historyStart === null || before.from < input.historyStart) {
    return { status: 'before_records', now, before, historyStart: input.historyStart }
  }
  return { status: 'compared', sameDays: running, now, before }
}

/** F26: one figure now and before, and what the difference means. */
export interface Change {
  readonly nowCents: Cents
  readonly beforeCents: Cents
  /** Now − before. */
  readonly changeCents: Cents
  /** |change| × 10,000 ÷ |before|, half-up, with the change's sign; null when before is $0. */
  readonly changeBp: number | null
  /** Under 100 cents either way is 'same'. */
  readonly direction: 'more' | 'less' | 'same'
  /** 'watch' for more spent or less received or saved; 'neutral' when the same. */
  readonly meaning: 'good' | 'watch' | 'neutral'
}

export interface RowChange extends Change {
  readonly categoryId: string
}

export interface BlockChange {
  readonly total: Change
  /** In the block's own order, one per row of the sheet. */
  readonly rows: readonly RowChange[]
}

type BlockKind = keyof PeriodSheet['blocks']

export type PeriodComparisonInput = ComparisonWindowInput & {
  readonly categories: readonly PeriodCategory[]
  /** Every monthly amount typed up to the period shown; each month resolves its own (D13). */
  readonly planHistory: readonly PlanHistoryRow[]
  /** Ledger rows for both windows; any others are left out by the windows. */
  readonly entries: readonly PeriodEntry[]
}

export type PeriodComparison =
  | {
      readonly status: 'compared'
      readonly sameDays: boolean
      readonly now: DateWindow
      readonly before: DateWindow
      /** F7's Spent, and the Income and Savings totals, over each window. */
      readonly summary: { readonly spent: Change; readonly income: Change; readonly saved: Change }
      readonly blocks: Readonly<Record<BlockKind, BlockChange>>
    }
  | Exclude<ComparisonWindow, { readonly status: 'compared' }>

/** On these, more is money in or put aside; everywhere else, more is money spent. */
const MORE_IS_GOOD: ReadonlySet<BlockKind> = new Set(['income', 'savings'])
const KINDS: readonly BlockKind[] = ['income', 'savings', 'variable', 'bill', 'debt', 'subscription']

/**
 * F25 and F26: each window through periodSheet, and each figure set against
 * its twin. A month, week or Year is counted month by month, each month
 * with its own monthly amounts, so a planned bill counts on its due day on
 * both sides (F8, D13). A pay period is counted as the Paycheck counts it,
 * each side with its own payday month's shares (F15). Only Actuals are
 * compared, so no budget is read.
 */
export function periodComparison(input: PeriodComparisonInput): PeriodComparison {
  const window = comparisonWindow(input)
  if (window.status !== 'compared') return window
  const now = added(sheets(input, window.now))
  const before = added(sheets(input, window.before))
  const blocks = Object.fromEntries(
    KINDS.map((kind): [BlockKind, BlockChange] => {
      const earlier = new Map(before.blocks[kind].rows.map((r) => [r.categoryId, r.actualCents]))
      const up = MORE_IS_GOOD.has(kind)
      return [
        kind,
        {
          total: change(now.blocks[kind].actualTotalCents, before.blocks[kind].actualTotalCents, up),
          rows: now.blocks[kind].rows.map((r) => {
            const was = earlier.get(r.categoryId)
            // Both sheets list every category passed in, so this cannot miss.
            if (was === undefined) throw new RangeError(`Category ${r.categoryId} is missing from the earlier window`)
            return { categoryId: r.categoryId, ...change(r.actualCents, was, up) }
          }),
        },
      ]
    }),
  ) as Record<BlockKind, BlockChange>
  return {
    status: 'compared',
    sameDays: window.sameDays,
    now: window.now,
    before: window.before,
    summary: {
      spent: change(now.summary.spentCents, before.summary.spentCents, false),
      income: change(now.summary.incomeCents, before.summary.incomeCents, true),
      saved: change(now.summary.savedCents, before.summary.savedCents, true),
    },
    blocks,
  }
}

/** One window's sheets: one per month it touches, or the pay period's one. */
function sheets(input: PeriodComparisonInput, window: DateWindow): PeriodSheet[] {
  const sheet = (from: IsoDate, to: IsoDate, plans: readonly PeriodPlan[]): PeriodSheet =>
    periodSheet({
      from,
      to,
      categories: input.categories,
      budgets: [],
      plans,
      entries: input.entries,
      statementPeriodEnds: [],
      startingBalanceCents: null,
    })
  if (input.period === 'pay') {
    // Each window starts on a payday, whose month's shares it counts (F15).
    const month = monthBounds(window.from).start
    return [sheet(window.from, window.to, payPlans(input.categories, input.planHistory, month, input.schedule.frequency))]
  }
  const out: PeriodSheet[] = []
  for (let month = monthBounds(window.from).start; month <= window.to; month = shiftMonth(month, 1)) {
    const end = monthBounds(month).end
    out.push(
      sheet(
        month < window.from ? window.from : month,
        end > window.to ? window.to : end,
        plansInEffect(input.categories, input.planHistory, month),
      ),
    )
  }
  return out
}

/** The Actuals a comparison reads, added across a window's sheets. */
interface Actuals {
  readonly summary: { readonly spentCents: Cents; readonly incomeCents: Cents; readonly savedCents: Cents }
  readonly blocks: Readonly<
    Record<BlockKind, { readonly actualTotalCents: Cents; readonly rows: readonly { readonly categoryId: string; readonly actualCents: Cents }[] }>
  >
}

function added(list: readonly PeriodSheet[]): Actuals {
  const sum = (pick: (s: PeriodSheet) => Cents): Cents => sumCents(list.map(pick))
  // Every sheet lists the same categories in the same order: the first gives it.
  const first = list[0]!
  return {
    summary: {
      spentCents: sum((s) => s.summary.spentCents),
      incomeCents: sum((s) => s.summary.incomeCents),
      savedCents: sum((s) => s.summary.savedCents),
    },
    blocks: Object.fromEntries(
      KINDS.map((kind): [BlockKind, Actuals['blocks'][BlockKind]] => [
        kind,
        {
          actualTotalCents: sum((s) => s.blocks[kind].actualTotalCents),
          rows: first.blocks[kind].rows.map((r) => ({
            categoryId: r.categoryId,
            actualCents: sum((s) => s.blocks[kind].rows.find((x) => x.categoryId === r.categoryId)?.actualCents ?? missing(r.categoryId)),
          })),
        },
      ]),
    ) as Actuals['blocks'],
  }
}

function missing(categoryId: string): never {
  throw new RangeError(`Category ${categoryId} is missing from part of a window`)
}

/** F26. `moreIsGood` is true on Income and Savings. */
function change(now: Cents, before: Cents, moreIsGood: boolean): Change {
  const changeCents = subCents(now, before)
  const size = Math.abs(changeCents)
  const direction = size < 100 ? 'same' : changeCents > 0 ? 'more' : 'less'
  return {
    nowCents: now,
    beforeCents: before,
    changeCents,
    changeBp: before === 0 ? null : Math.sign(changeCents) * halfUpBp(size, Math.abs(before)),
    direction,
    meaning: direction === 'same' ? 'neutral' : (direction === 'more') === moreIsGood ? 'good' : 'watch',
  }
}

/** part × 10,000 ÷ whole, half-up, in BigInt so no amount can outrun a double (as shareOf). */
function halfUpBp(part: number, whole: number): number {
  return Number((BigInt(part) * 20_000n + BigInt(whole)) / (2n * BigInt(whole)))
}
