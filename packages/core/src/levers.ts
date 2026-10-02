/**
 * What to cut, and how much sooner it gets a goal there (F34,
 * docs/formula-decisions.md; plan slice A08).
 *
 * NOT workbook-derived. Each lever is a month's saving on one Variable
 * expenses category, measured against its own usual month (F27), never an
 * invented ideal: a tenth, a quarter, or "your best month", the gap
 * between the usual month and the lowest one the owner has actually had
 * (docs/ideas/savings-coach.md, "Proven-floor targets"). Every figure is
 * rounded to $5, because "trim it by $101.25" reads as false precision.
 */
import { type Cents, type IsoDate, cents } from '@budget/money-primitives'
import { timeEquivalent } from './goal.js'
import { completeMonths } from './history.js'
import { monthActuals } from './month-actuals.js'
import { usualMonth } from './notable.js'
import type { PeriodCategory, PeriodEntry } from './period-sheet.js'

export interface GoalLeversInput {
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers. */
  readonly readFrom: IsoDate
  /** Every category the entries name. */
  readonly categories: readonly PeriodCategory[]
  readonly entries: readonly PeriodEntry[]
  readonly goal: {
    /** From goalForecast. */
    readonly remainingCents: number
    readonly unitCostCents: number | null
  }
  /** The goal's middle weekly pace, from goalForecast; null with none. */
  readonly paceWeeklyCents: number | null
}

export type LeverKind = 'tenth' | 'quarter' | 'best_month'

export interface Lever {
  readonly categoryId: string
  readonly kind: LeverKind
  /** A month's saving, rounded half-up to $5. */
  readonly monthlyCents: Cents
  readonly weeklyCents: Cents
  /** With a pace: how many weeks sooner the goal is reached. */
  readonly weeksSooner: number | null
  /** With no pace: how many weeks the lever alone takes to reach it. */
  readonly weeksToGoal: number | null
  /** A month's saving in whole minutes of the goal's unit; null for a goal in dollars. */
  readonly minutesPerMonth: number | null
}

export interface GoalLevers {
  /** Every lever of every Variable category with a usual month, the largest saving first. */
  readonly levers: readonly Lever[]
  /** At most two categories, one lever each, the first being the top lever. */
  readonly offered: readonly Lever[]
}

const STEP = 500
const OFFERED = 2
/** The usual month and its lowest are taken over the same latest complete months (F27). */
const USUAL_MONTHS = 6

export function goalLevers(input: GoalLeversInput): GoalLevers {
  const remaining = cents(input.goal.remainingCents)
  const months = completeMonths(input).months.slice(0, USUAL_MONTHS)
  if (remaining <= 0 || months.length === 0) return { levers: [], offered: [] }
  const sheets = monthActuals({ categories: input.categories, entries: input.entries, months }).months
  // In the list's order, so levers of equal saving keep it: the sort below is stable.
  const variable = input.categories
    .filter((c) => c.kind === 'variable')
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const levers = variable.flatMap((c): Lever[] => {
    const totals = sheets.map((m) => ({ month: m.month, cents: m.actuals.get(c.id) ?? missing(c.id) }))
    const usual = usualMonth({ totals }).usualCents
    if (usual === null || usual <= 0) return []
    const lowest = Math.min(...totals.map((t) => t.cents))
    // A tenth is usual × 1,000 ÷ 10,000 and a quarter usual × 2,500 ÷ 10,000,
    // each taken straight to the nearest $5 so nothing is rounded twice.
    const savings: readonly (readonly [LeverKind, number])[] = [
      ['quarter', halfUp(BigInt(usual), 2_000n) * STEP],
      ['best_month', usual - lowest >= STEP ? halfUp(BigInt(usual - lowest), BigInt(STEP)) * STEP : 0],
      ['tenth', halfUp(BigInt(usual), 5_000n) * STEP],
    ]
    return savings.filter(([, monthly]) => monthly > 0).map(([kind, monthly]) => lever(input, remaining, c.id, kind, cents(monthly)))
  })
  const sorted = levers.sort((a, b) => b.monthlyCents - a.monthlyCents)

  // One lever a category: the quarter, or the best month when the quarter
  // rounds to nothing. `sorted` is largest first, so `offered` is too.
  const offered: Lever[] = []
  for (const l of sorted) {
    if (offered.length === OFFERED) break
    if (offered.some((o) => o.categoryId === l.categoryId) || l.weeksSooner === 0) continue
    const hasQuarter = sorted.some((q) => q.categoryId === l.categoryId && q.kind === 'quarter')
    if (l.kind === 'quarter' || (l.kind === 'best_month' && !hasQuarter)) offered.push(l)
  }
  return { levers: sorted, offered }
}

function lever(input: GoalLeversInput, remaining: Cents, categoryId: string, kind: LeverKind, monthly: Cents): Lever {
  const weekly = cents(halfUp(BigInt(monthly) * 12n, 52n))
  const pace = input.paceWeeklyCents
  const weeks = (per: number) => Math.ceil(remaining / per)
  const rate = input.goal.unitCostCents
  return {
    categoryId,
    kind,
    monthlyCents: monthly,
    weeklyCents: weekly,
    weeksSooner: pace === null || pace <= 0 ? null : weeks(pace) - weeks(pace + weekly),
    weeksToGoal: pace === null || pace <= 0 ? weeks(weekly) : null,
    minutesPerMonth: rate === null ? null : timeEquivalent({ amountCents: monthly, unitCostPerHourCents: rate }).totalMinutes,
  }
}

/** part ÷ whole for a part of 0 or more, half-up. */
function halfUp(part: bigint, whole: bigint): number {
  return Number((part * 2n + whole) / (2n * whole))
}

/** The engine's own sheets list every category given, so this cannot miss. */
function missing(categoryId: string): never {
  throw new RangeError(`Category ${categoryId} is missing from the levers' sheets`)
}
