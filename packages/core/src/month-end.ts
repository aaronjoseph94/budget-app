/**
 * Where this month ends (F30, docs/formula-decisions.md; plan slice A13).
 *
 * NOT workbook-derived: the workbook has no forecast, and its End of month
 * (F7) is left as it is. This adds what F7 leaves out, pay still due,
 * Variable spending still to come and savings still planned, as a range of
 * scenarios: this month's pace and each earlier complete month's rate for
 * the days left. Honest about thin history: one rough figure before the 7th
 * or under three complete months, and nothing at all before the 7th with no
 * complete month. Nothing here is stored.
 */
import { type Cents, type IsoDate, ZERO_CENTS, cents, sumCents } from '@budget/money-primitives'
import type { ExpectedPay } from './expected-pay.js'
import { type Evidence, completeMonths, evidenceOf } from './history.js'
import { monthActuals } from './month-actuals.js'
import { type MonthForecastInput, monthPosition } from './month-position.js'
import { median } from './stats.js'
import { monthBounds } from './week.js'

/** The least, the median and the most, each rounded to $10; all three the median when rough. */
export interface Spread { readonly low: Cents; readonly mid: Cents; readonly high: Cents }

export interface MonthEndForecast {
  readonly status: 'too_early' | 'rough' | 'range'
  /** The 7th, when it is too early to say anything; null otherwise. */
  readonly checkBackOn: IsoDate | null
  /** Complete months the scenarios use, at most 6 (F24). */
  readonly completeMonths: number
  readonly evidence: Evidence
  /** The month so far, as the Month shows it (F7). */
  readonly startCents: Cents | null
  readonly incomeCents: Cents
  readonly spentCents: Cents
  readonly savedCents: Cents
  readonly pay: ExpectedPay
  /** Planned amounts no real charge has replaced yet (D5), already inside Spent. */
  readonly billsNotChargedCents: Cents
  /** Σ max(0, goal − actual) over the Savings rows with a goal. */
  readonly savingsPlannedCents: Cents
  /** The median scenario's Variable spending still to come, to $10; null when too early. */
  readonly variableToComeCents: Cents | null
  /** Spent at the month's end; null when too early. */
  readonly spent: Spread | null
  /** The bank balance at the month's end; null when too early or with no start typed (D17). */
  readonly end: Spread | null
}

const FIRST_DAY_WITH_A_PACE = 7
const MONTHS = 6

export function monthEndForecast(input: MonthForecastInput): MonthEndForecast {
  const position = monthPosition(input)
  const { sheet, availableCents } = position
  const { start, end } = monthBounds(input.asOf)
  const d = Number(input.asOf.slice(8))
  const D = Number(end.slice(8))
  const months = completeMonths(input).months.slice(0, MONTHS)
  const variable = new Set(input.categories.filter((c) => c.kind === 'variable').map((c) => c.id))

  // Variable spending still to come, one figure per scenario; never below $0.
  const toCome: number[] = []
  const actual = sheet.blocks.variable.actualTotalCents
  if (d >= FIRST_DAY_WITH_A_PACE) {
    const size = halfUp(BigInt(Math.abs(actual)) * BigInt(D), BigInt(d))
    toCome.push(Math.max(0, (actual < 0 ? -size : size) - actual))
  }
  for (const m of monthActuals({ ...input, months }).months) {
    const total = sumCents([...m.actuals].flatMap(([id, c]) => (variable.has(id) ? [c] : [])))
    const days = Number(monthBounds(m.month).end.slice(8))
    toCome.push(total > 0 ? halfUp(BigInt(D - d) * BigInt(total), BigInt(days)) : 0)
  }

  const shared = {
    completeMonths: months.length,
    evidence: evidenceOf(months.length),
    startCents: sheet.summary.startingBalanceCents,
    incomeCents: sheet.summary.incomeCents,
    spentCents: sheet.summary.spentCents,
    savedCents: sheet.summary.savedCents,
    pay: position.pay,
    billsNotChargedCents: position.billsNotChargedCents,
    savingsPlannedCents: position.savingsPlannedCents,
  }
  if (toCome.length === 0) {
    return { ...shared, status: 'too_early', checkBackOn: dayOf(start, FIRST_DAY_WITH_A_PACE), variableToComeCents: null, spent: null, end: null }
  }
  const rough = d < FIRST_DAY_WITH_A_PACE || months.length < 3
  // The least spent is the most left: the spread of each follows from the same scenarios.
  const spread = (from: Cents, sign: 1 | -1): Spread => {
    const values = toCome.map((c) => from + sign * c)
    const mid = toTen(median({ values })!)
    if (rough) return { low: mid, mid, high: mid }
    return { low: toTen(Math.min(...values)), mid, high: toTen(Math.max(...values)) }
  }
  return {
    ...shared,
    status: rough ? 'rough' : 'range',
    checkBackOn: null,
    variableToComeCents: toTen(median({ values: toCome })!),
    spent: spread(sheet.summary.spentCents, 1),
    end: availableCents === null ? null : spread(availableCents, -1),
  }
}

/** To the nearest $10, half-up on the magnitude: −$15.00 is −$20. */
export function toTen(value: number): Cents {
  const size = Math.floor((Math.abs(value) + 500) / 1_000) * 1_000
  return value < 0 ? cents(ZERO_CENTS - size) : cents(size)
}

/** part ÷ whole for a part of 0 or more, half-up. */
function halfUp(part: bigint, whole: bigint): number {
  return Number((part * 2n + whole) / (2n * whole))
}

function dayOf(monthStart: IsoDate, day: number): IsoDate {
  return `${monthStart.slice(0, 8)}${String(day).padStart(2, '0')}` as IsoDate
}
