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
 * before (F25–F27), stale data and rows waiting in Review (F44).
 */
import { type Cents, type IsoDate, daysBetween } from '@budget/money-primitives'
import type { BudgetHistoryRow } from './budgets.js'
import { type Change, periodComparison } from './compare.js'
import { type Evidence, completeMonths } from './history.js'
import { impactScore } from './impact.js'
import { changeSize, notableBand } from './notable.js'
import type { PeriodCategory, PeriodEntry } from './period-sheet.js'
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
}

export type FactKind = 'stale_data' | 'rows_waiting' | 'month_so_far' | 'week_so_far'

/** One figure a sentence can name by its slot. A change carries its direction word (ADR 0005 §5). */
export type Figure =
  | { readonly unit: 'cents'; readonly value: Cents }
  | { readonly unit: 'change'; readonly value: Cents; readonly direction: Change['direction'] }
  | { readonly unit: 'date'; readonly value: IsoDate }
  | { readonly unit: 'month'; readonly value: IsoDate }
  | { readonly unit: 'count'; readonly value: number }

export interface Fact {
  /** Stable while its subject is: `summary:month`, `cat:<id>:change`, … */
  readonly key: string
  readonly kind: FactKind
  /** What it is about. The label is what the owner sees: a name, never an id. */
  readonly subject: { readonly type: 'data' | 'review' | 'month' | 'week'; readonly id: string | null; readonly label: string }
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
}

const MAX_FACTS = 12
/** A statement ending more than this many days before asOf is stale (F44). */
const STALE_AFTER_DAYS = 10

export function factsDigest(input: FactsDigestInput): FactsDigest {
  const history = completeMonths(input)
  const first: Fact[] = [...staleData(input), ...rowsWaiting(input), ...summaries(input)]
  return { version: DIGEST_VERSION, completeMonths: history.months.length, facts: first.slice(0, MAX_FACTS) }
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
