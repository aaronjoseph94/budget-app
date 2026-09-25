/**
 * The facts the Coach may speak about, in one place (plan §3.1, ADR 0005 §1).
 *
 * The engine decides what is true and what is worth saying; the words come
 * later, from savings-coach's templates or a model's blanks. Each fact has
 * a stable key, a kind, what it is about, its direction, size and evidence,
 * whether it is worth a card, its figures by slot, and its impact (F44).
 * Nothing here is stored: it is recomputed on every read, so a figure is
 * always the ledger's as it stands.
 *
 * Version 1 (plan A07): this month and this week against the same days
 * before (F25–F27); each Variable expenses row against the same days last
 * month, sized by its usual month (F27); over, near and pace on budget
 * (F28); stale data and rows waiting in Review (F44). Variable only: a
 * change on Bills or Debts is a bill moving, not a habit (F38 will say it).
 * Plan A08 adds two wins (F33, F34): more saved than by this day last
 * month, and a milestone passed on an active goal. They join version 1:
 * nothing reads the version until the AI's words are cached (plan A12).
 * Plan A13 adds the month's forecast (F30 to F32) beside the facts, never
 * ranked among them: the Coach gives it a card of its own.
 */
import { type Cents, type IsoDate, cents, daysBetween } from '@budget/money-primitives'
import type { BudgetHistoryRow } from './budgets.js'
import { type Change, periodComparison } from './compare.js'
import { cashFlow30 } from './cash-flow-30.js'
import type { IncomeSchedule } from './expected-pay.js'
import { type Evidence, completeMonths } from './history.js'
import { impactScore } from './impact.js'
import { goalMilestones } from './goal-milestones.js'
import { changeSize, notableBand, usualMonth } from './notable.js'
import { budgetStanding, categoryPace } from './pace.js'
import { safeToSpend } from './safe-to-spend.js'
import { monthActuals } from './month-actuals.js'
import { monthEndForecast } from './month-end.js'
import type { MonthForecastInput } from './month-position.js'
import { type PeriodCategory, type PeriodEntry, monthSheet } from './period-sheet.js'
import type { PlanHistoryRow } from './plans.js'
import { monthBounds, weekBounds } from './week.js'

export const DIGEST_VERSION = 1

export interface FactsDigestInput {
  /** Today: its month and week are the ones spoken about. */
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers. A month before it was not read, and is missing, not $0. */
  readonly readFrom: IsoDate
  readonly categories: readonly PeriodCategory[]
  /** Every budget typed up to asOf's month. */
  readonly budgetHistory: readonly BudgetHistoryRow[]
  /** Every monthly amount typed up to asOf's month. */
  readonly planHistory: readonly PlanHistoryRow[]
  /** Ledger rows from readFrom to the end of asOf's month. */
  readonly entries: readonly PeriodEntry[]
  /** The latest imported statement's last day; null with none. */
  readonly latestStatementEnd: IsoDate | null
  /** Rows waiting in Review; null when the count could not be read. */
  readonly pendingCount: number | null
  /** The active goals, main first (F45), whose milestones are cheered; none where only the summaries are needed. */
  readonly goals: readonly DigestGoal[]
  /** What the month's forecast needs besides (F29 to F32); left out where only the summaries are needed. */
  readonly forecast?: { readonly paySchedules: readonly IncomeSchedule[]; readonly startingBalanceCents: number | null }
}

/** An active goal as goalMilestones reads it, with what the owner calls it. */
export interface DigestGoal {
  readonly id: string
  readonly name: string
  readonly targetCents: number
  /** Saved now: the fund's kept balance (D16), or the amount typed on no fund. */
  readonly savedCents: number
  readonly unitCostCents: number | null
  readonly fundCategoryId: string | null
  readonly typedOn: IsoDate | null
}

export type FactKind =
  | 'stale_data'
  | 'rows_waiting'
  | 'month_so_far'
  | 'week_so_far'
  | 'category_change'
  | 'over_budget'
  | 'near_budget'
  | 'budget_pace'
  | 'saved_more'
  | 'goal_milestone'
  | 'month_forecast'

/** One figure a sentence can name by its slot. A change carries its direction word (ADR 0005 §5). */
export type Figure =
  | { readonly unit: 'cents'; readonly value: Cents }
  | { readonly unit: 'change'; readonly value: Cents; readonly direction: Change['direction'] }
  | { readonly unit: 'date'; readonly value: IsoDate }
  | { readonly unit: 'month'; readonly value: IsoDate }
  | { readonly unit: 'count'; readonly value: number }
  /** Whole hours of a goal's unit. */
  | { readonly unit: 'hours'; readonly value: number }
  /** A share of a whole, in basis points. */
  | { readonly unit: 'share'; readonly value: number }
  /** An amount the engine rounded to whole dollars, such as F30's $10 steps: drawn without cents. */
  | { readonly unit: 'dollars'; readonly value: Cents }

export interface Fact {
  /** Stable while its subject is: `summary:month`, `cat:<id>:change`, … */
  readonly key: string
  readonly kind: FactKind
  /** What it is about. The label is what the owner sees: a name, never an id. */
  readonly subject: {
    readonly type: 'data' | 'review' | 'month' | 'week' | 'category' | 'goal'
    readonly id: string | null
    readonly label: string
  }
  readonly direction: 'up' | 'down' | 'same' | 'none'
  /** Against its band (F27); null where there is no change to size. */
  readonly size: 'slight' | 'clear' | 'big' | null
  readonly evidence: Evidence
  /** More spent is 'watch', less is 'good'; a count or a date is 'info'. */
  readonly meaning: 'good' | 'watch' | 'info'
  /** Worth a card (F27, F28, F44). */
  readonly notable: boolean
  readonly figures: Readonly<Record<string, Figure>>
  /** F44: a month's money × evidence weight. */
  readonly impact: number
  /** What a dismissal names: the same cause does not come back, a new one does. */
  readonly cause: string
}

export interface FactsDigest {
  readonly version: typeof DIGEST_VERSION
  /** Complete months inside the records and the read (F24). */
  readonly completeMonths: number
  /** At most 12, in rank order (F44). */
  readonly facts: readonly Fact[]
  /** The month's forecast (plan A13), never ranked among the facts; null without its inputs or too early. */
  readonly forecast: Fact | null
}

const MAX_FACTS = 12
/** A statement ending more than this many days before asOf is stale (F44). */
const STALE_AFTER_DAYS = 10

export function factsDigest(input: FactsDigestInput): FactsDigest {
  const history = completeMonths(input)
  const first: Fact[] = [...staleData(input), ...rowsWaiting(input), ...summaries(input)]
  const rest = [...categoryChanges(input, history.months), ...budgets(input), ...savedMore(input), ...milestones(input)].sort(
    (a, b) => Number(b.notable) - Number(a.notable) || b.impact - a.impact || (a.key < b.key ? -1 : 1),
  )
  const forecast = input.forecast === undefined ? null : forecastFact({ ...input, ...input.forecast })
  return { version: DIGEST_VERSION, completeMonths: history.months.length, facts: [...first, ...rest].slice(0, MAX_FACTS), forecast }
}

function staleData(input: FactsDigestInput): Fact[] {
  const end = input.latestStatementEnd
  if (end === null) return []
  const days = daysBetween(end, input.asOf)
  if (days <= STALE_AFTER_DAYS) return []
  return [
    info('data:stale', 'stale_data', { type: 'data', id: null, label: 'Your statements' }, `stale_data:${end}`, {
      through: { unit: 'date', value: end },
      days: { unit: 'count', value: days },
    }),
  ]
}

function rowsWaiting(input: FactsDigestInput): Fact[] {
  const count = input.pendingCount
  if (count === null || count <= 0) return []
  return [
    info('review:waiting', 'rows_waiting', { type: 'review', id: null, label: 'Review' }, `rows_waiting:${input.asOf}`, {
      count: { unit: 'count', value: count },
    }),
  ]
}

function info(key: string, kind: FactKind, subject: Fact['subject'], cause: string, figures: Fact['figures']): Fact {
  return { key, kind, subject, direction: 'none', size: null, evidence: 'thin', meaning: 'info', notable: true, figures, impact: 0, cause }
}

/**
 * This month and this week so far against the same days before (F25),
 * sized by the summary's band (F27). A summary compares two windows and uses
 * no baseline, so its evidence is thin by definition, and the Month, which
 * reads only last month, words it exactly as the Coach does.
 */
function summaries(input: FactsDigestInput): Fact[] {
  const shared = {
    asOf: input.asOf,
    historyStart: input.historyStart,
    categories: input.categories,
    planHistory: input.planHistory,
    entries: input.entries,
  }
  const month = monthBounds(input.asOf).start
  const week = weekBounds(input.asOf).start
  const out: Fact[] = []
  const byMonth = periodComparison({ ...shared, period: 'month', month })
  if (byMonth.status === 'compared') {
    out.push(summary('summary:month', 'month_so_far', { type: 'month', id: month, label: 'This month' }, byMonth.summary.spent, byMonth, input.asOf))
  }
  const byWeek = periodComparison({ ...shared, period: 'week', week })
  if (byWeek.status === 'compared') {
    out.push(summary('summary:week', 'week_so_far', { type: 'week', id: week, label: 'This week' }, byWeek.summary.spent, byWeek, input.asOf))
  }
  return out
}

function summary(
  key: string,
  kind: FactKind,
  subject: Fact['subject'],
  spent: Change,
  windows: { readonly now: { readonly to: IsoDate }; readonly before: { readonly to: IsoDate } },
  asOf: IsoDate,
): Fact {
  const { bandCents } = notableBand({ basis: 'summary', beforeCents: spent.beforeCents })
  const sized = changeSize({ changeCents: spent.changeCents, bandCents })
  const same = spent.direction === 'same'
  return {
    key,
    kind,
    subject,
    direction: same ? 'same' : spent.direction === 'more' ? 'up' : 'down',
    // Under $1.00 is the same (F26), whatever its band.
    size: same ? 'slight' : sized.size,
    evidence: 'thin',
    meaning: same ? 'info' : spent.meaning === 'good' ? 'good' : 'watch',
    notable: !same && sized.notable,
    figures: {
      now: { unit: 'cents', value: spent.nowCents },
      before: { unit: 'cents', value: spent.beforeCents },
      change: { unit: 'change', value: spent.changeCents, direction: spent.direction },
      now_to: { unit: 'date', value: windows.now.to },
      before_to: { unit: 'date', value: windows.before.to },
    },
    impact: impactScore({ effect: 'monthly', monthlyCents: spent.changeCents, evidence: 'thin' }).impact,
    cause: `${kind}:${asOf}`,
  }
}

/** How far into its month asOf is: d of D. */
function dayOf(asOf: IsoDate): { readonly start: IsoDate; readonly d: number; readonly D: number } {
  const { start, end } = monthBounds(asOf)
  return { start, d: Number(asOf.slice(8)), D: Number(end.slice(8)) }
}

function category(c: PeriodCategory): Fact['subject'] {
  return { type: 'category', id: c.id, label: c.name }
}

/** Each Variable row's same days against last month's (F25), sized by its usual month (F27). */
function categoryChanges(input: FactsDigestInput, months: readonly IsoDate[]): Fact[] {
  const { start, d, D } = dayOf(input.asOf)
  const compared = periodComparison({ ...input, period: 'month', month: start })
  if (compared.status !== 'compared' || months.length === 0) return []
  // Each complete month's Actuals, by category: the usual month's six at most.
  const recent = monthActuals({ ...input, months: months.slice(0, 6) }).months.map((m) => ({ month: m.month, rows: m.actuals }))
  const names = new Map(input.categories.map((c) => [c.id, c]))
  return compared.blocks.variable.rows.flatMap((row): Fact[] => {
    if (row.direction === 'same') return []
    const id = row.categoryId
    const usual = usualMonth({ totals: recent.map((m) => ({ month: m.month, cents: m.rows.get(id) ?? missing(id) })) })
    // At least one complete month, so there is a usual month and a spread.
    const usualCents = usual.usualCents ?? missing(id)
    const madCents = usual.madCents ?? missing(id)
    const { bandCents } = notableBand({ basis: 'usual', usualCents, madCents, months: usual.months, days: d, daysInMonth: D })
    const sized = changeSize({ changeCents: row.changeCents, bandCents })
    const direction = row.direction === 'more' ? 'up' : 'down'
    return [
      {
        key: `cat:${row.categoryId}:change`,
        kind: 'category_change',
        subject: category(names.get(row.categoryId) ?? missing(row.categoryId)),
        direction,
        size: sized.size,
        evidence: usual.evidence,
        meaning: row.meaning === 'good' ? 'good' : 'watch',
        notable: sized.notable,
        figures: {
          now: { unit: 'cents', value: row.nowCents },
          before: { unit: 'cents', value: row.beforeCents },
          change: { unit: 'change', value: row.changeCents, direction: row.direction },
          usual: { unit: 'cents', value: usualCents },
          before_month: { unit: 'month', value: compared.before.from },
          months: { unit: 'count', value: usual.months },
        },
        impact: impactScore({ effect: 'change', changeCents: row.changeCents, days: d, daysInMonth: D, evidence: usual.evidence }).impact,
        cause: `category_change:${row.categoryId}:${start}:${direction}`,
      },
    ]
  })
}

/** Over, near and pace on each Variable budget this month (F28). */
function budgets(input: FactsDigestInput): Fact[] {
  const { start } = dayOf(input.asOf)
  const sheet = monthSheet({ ...input, asOf: start, statementPeriodEnds: [], startingBalanceCents: null })
  const names = new Map(input.categories.map((c) => [c.id, c]))
  return sheet.blocks.variable.rows.flatMap((row): Fact[] => {
    const budget = row.budgetCents
    const standing = budgetStanding({ actualCents: row.actualCents, budgetCents: budget })
    if (budget === null || standing.standing === 'none') return []
    const subject = category(names.get(row.categoryId) ?? missing(row.categoryId))
    // Over and near set a charge against the owner's own number, so solid;
    // a pace is an estimate from the days so far, so some (F44).
    const fact = (kind: FactKind, suffix: string, notable: boolean, evidence: Evidence, effect: Cents, figures: Fact['figures']): Fact => ({
      key: `cat:${row.categoryId}:${suffix}`,
      kind,
      subject,
      direction: 'none',
      size: null,
      evidence,
      meaning: 'watch',
      notable,
      figures,
      impact: impactScore({ effect: 'monthly', monthlyCents: effect, evidence }).impact,
      cause: `${kind}:${row.categoryId}:${start}`,
    })
    const actual = { unit: 'cents', value: row.actualCents } as const
    const planned = { unit: 'cents', value: budget } as const
    if (standing.overCents !== null) {
      // Already past it: a pace beside it would say the same thing twice.
      const over = { unit: 'cents', value: standing.overCents } as const
      return [fact('over_budget', 'over_budget', standing.notable, 'solid', standing.overCents, { actual, budget: planned, over })]
    }
    const out: Fact[] = []
    if (standing.standing === 'near' && standing.leftCents !== null) {
      const left = { unit: 'cents', value: standing.leftCents } as const
      out.push(fact('near_budget', 'near_budget', true, 'solid', standing.leftCents, { actual, budget: planned, left }))
    }
    const pace = categoryPace({ asOf: input.asOf, month: start, actualCents: row.actualCents, budgetCents: budget })
    if (pace.paceCents !== null && pace.overCents !== null) {
      const figures = {
        actual,
        pace: { unit: 'cents', value: pace.paceCents },
        budget: planned,
        over: { unit: 'cents', value: pace.overCents },
      } as const
      out.push(fact('budget_pace', 'pace', pace.notable, 'some', pace.overCents, figures))
    }
    return out
  })
}

/**
 * More moved into savings than by this day last month (F34's wins), sized
 * and weighed as a summary is (F27, F44). Saving less is not a card: the
 * Month's Savings row already shows it, and a coach does not scold.
 */
function savedMore(input: FactsDigestInput): Fact[] {
  const { start } = dayOf(input.asOf)
  const compared = periodComparison({ ...input, period: 'month', month: start })
  if (compared.status !== 'compared' || compared.summary.saved.direction !== 'more') return []
  const saved = compared.summary.saved
  const { bandCents } = notableBand({ basis: 'summary', beforeCents: saved.beforeCents })
  const sized = changeSize({ changeCents: saved.changeCents, bandCents })
  return [
    {
      key: 'summary:saved',
      kind: 'saved_more',
      subject: { type: 'month', id: start, label: 'This month' },
      direction: 'up',
      size: sized.size,
      evidence: 'thin',
      meaning: 'good',
      notable: sized.notable,
      figures: {
        now: { unit: 'cents', value: saved.nowCents },
        before: { unit: 'cents', value: saved.beforeCents },
        change: { unit: 'change', value: saved.changeCents, direction: saved.direction },
        before_month: { unit: 'month', value: compared.before.from },
      },
      impact: impactScore({ effect: 'monthly', monthlyCents: saved.changeCents, evidence: 'thin' }).impact,
      cause: `saved_more:${start}`,
    },
  ]
}

/**
 * Each active goal's milestone passed since last week began (F33), always
 * a card. Worth one step of the goal, 5 hours at its cost an hour or a
 * tenth of its target, and solid: a balance is not an estimate.
 */
function milestones(input: FactsDigestInput): Fact[] {
  return input.goals.flatMap((goal): Fact[] => {
    const { unit, passed } = goalMilestones({ asOf: input.asOf, entries: input.entries, goal })
    if (passed === null) return []
    // One step: 5 hours at its cost an hour, or a tenth of its target, half-up.
    const step = goal.unitCostCents !== null ? 5 * goal.unitCostCents : Number((BigInt(goal.targetCents) * 2n + 10n) / 20n)
    return [
      {
        key: `goal:${goal.id}:milestone`,
        kind: 'goal_milestone',
        subject: { type: 'goal', id: goal.id, label: goal.name },
        direction: 'none',
        size: null,
        evidence: 'solid',
        meaning: 'good',
        notable: true,
        figures: { milestone: { unit, value: passed } },
        impact: impactScore({ effect: 'monthly', monthlyCents: cents(step), evidence: 'solid' }).impact,
        cause: `goal_milestone:${goal.id}:${passed}`,
      },
    ]
  })
}

/**
 * The forecast as one fact the Coach's words may speak of (plan §3.11 #8,
 * A13; ADR 0005 §1): where the month is heading, safe to spend and the
 * tightest day, each a blank the app fills (F30, F31, F32). It is never a
 * ranked card (not notable): the Coach gives the forecast its own card,
 * and the Forecast screen leads with its sentence. Its claims, for the
 * AI's cached words, are its meaning and evidence: words written for a
 * comfortable month are never reused once the month would run short.
 * Null when it is too early to say anything (F30).
 */
export function forecastFact(input: MonthForecastInput): Fact | null {
  const forecast = monthEndForecast(input)
  if (forecast.spent === null) return null
  const month = monthBounds(input.asOf).start
  const figures: Record<string, Figure> = { month: { unit: 'month', value: month }, spent: { unit: 'dollars', value: forecast.spent.mid } }
  let short = false
  const { end } = forecast
  const safe = safeToSpend(input)
  const { lowest } = cashFlow30(input)
  // With a start typed there is always an end, a daily figure and a line, so
  // words written for them can always be drawn; without one, none of them.
  if (end !== null && safe.perDayCents !== null && lowest !== null) {
    figures['end'] = { unit: 'dollars', value: end.mid }
    figures['low'] = { unit: 'dollars', value: end.low }
    figures['high'] = { unit: 'dollars', value: end.high }
    figures['safe_day'] = { unit: 'cents', value: safe.perDayCents }
    figures['days'] = { unit: 'count', value: safe.days }
    figures['tightest_day'] = { unit: 'date', value: lowest.date }
    figures['tightest'] = { unit: 'cents', value: lowest.balanceCents }
    short = end.low < 0 || safe.status === 'nothing_left' || lowest.balanceCents < 0
  }
  return {
    key: 'forecast:month',
    kind: 'month_forecast',
    subject: { type: 'month', id: month, label: 'This month' },
    direction: 'none',
    size: null,
    evidence: forecast.evidence,
    meaning: short ? 'watch' : 'info',
    notable: false,
    figures,
    impact: 0,
    cause: `month_forecast:${month}`,
  }
}

/** The engine's own sheets list every category given, so this cannot miss. */
function missing(categoryId: string): never {
  throw new RangeError(`Category ${categoryId} is missing from the digest's sheets`)
}
