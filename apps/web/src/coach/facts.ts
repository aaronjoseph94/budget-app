/**
 * The Coach's facts: every row the digest needs, read for the Coach and
 * handed to packages/core's factsDigest (plan A07).
 *
 * The Coach reads twelve months back itself, off the Month's path, so the
 * usual month, a goal's pace and its levers have up to six complete months
 * to stand on (F27, F33, F34); Savings reads the same year. Nothing here
 * adds or compares: which months are complete, what changed and what is
 * worth a card is core's to say. A failed read or an engine refusal fails
 * the cards alone; the goals card beside them still shows.
 */
import { useEffect, useMemo, useState } from 'react'
import { factsDigest, historyStart, isoDate, monthBounds, shiftMonth, type DigestGoal, type FactsDigest, type IncomeSchedule } from '@budget/core'
import { useAppData } from '../app-data.js'
import {
  getMonthBalance,
  latestStatementEnd,
  listBudgetHistory,
  listPaySchedules,
  listPlanHistory,
  listTransactions,
  needsOneTimeUpdate,
  readRecordsStart,
  type BudgetRow,
  type Category,
  type LedgerRow,
  type PayScheduleRow,
  type PlanRow,
} from '../ledger.js'
import { budgetsForCore, categoriesForCore, entriesForCore, historyFrom, type RecordsStart, plansForCore, shopEntriesForCore } from '../sheet-input.js'

/** What the digest reads, as the database gave it. */
export interface DigestRows {
  readonly asOf: string
  /** The first day `rows` covers. */
  readonly readFrom: string
  readonly rows: readonly LedgerRow[]
  readonly budgets: readonly BudgetRow[]
  readonly plans: readonly PlanRow[]
  readonly statementEnds: readonly string[]
  readonly records: RecordsStart
  /** Rows waiting in Review, or null when that count did not load. */
  readonly pending: number | null
  /** What the month's forecast needs besides (plan A13); left out where no forecast is made. */
  readonly forecast?: ForecastRows
}

/** When each source is paid and this month's typed start; or that they did not load, and whether an update is missing. */
export type ForecastRows =
  | { readonly status: 'ready'; readonly schedules: readonly PayScheduleRow[]; readonly balance: number | null }
  | { readonly status: 'failed'; readonly missingUpdate: boolean }

/** Where the records start (F24), from what was read. */
export function historyOf(read: DigestRows): ReturnType<typeof historyStart>['start'] {
  return historyFrom(read.records)
}

/**
 * The rows, renamed for core, through factsDigest. Throws where the engine
 * refuses a row. The goals are the active ones, main first, whose
 * milestones are cheered; the Month, which shows only the day's line, gives
 * none. With the shops marked "Not a subscription", the detectors run too
 * (F38, F39), and so do the habits' wins, from each category's weekly
 * budget (F40); without, as on the Month's line, neither does.
 */
export function digestOf(
  read: DigestRows,
  categories: readonly Category[],
  goals: readonly DigestGoal[] = [],
  notSubscriptions: readonly string[] | null = null,
): FactsDigest {
  const latest = read.statementEnds.map((e) => isoDate(e)).sort().at(-1) ?? null
  return factsDigest({
    asOf: isoDate(read.asOf),
    historyStart: historyOf(read),
    readFrom: isoDate(read.readFrom),
    categories: categoriesForCore(categories),
    budgetHistory: budgetsForCore(read.budgets),
    planHistory: plansForCore(read.plans),
    entries: entriesForCore(read.rows),
    latestStatementEnd: latest,
    pendingCount: read.pending,
    goals,
    ...(read.forecast?.status === 'ready' ? { forecast: forecastOf(read.forecast) } : {}),
    ...(notSubscriptions === null
      ? {}
      : {
          shops: { entries: shopEntriesForCore(read.rows), notSubscriptions },
          habits: { weeklyBudgets: categories.map((c) => ({ categoryId: c.id, weeklyBudgetCents: c.weekly_budget_cents })) },
        }),
  })
}

/** The schedules and start, renamed for core's forecast (F29 to F32). */
export function forecastOf(rows: Extract<ForecastRows, { status: 'ready' }>): {
  readonly paySchedules: readonly IncomeSchedule[]
  readonly startingBalanceCents: number | null
} {
  return {
    paySchedules: rows.schedules.map((s) => ({ categoryId: s.category_id, firstPayDate: isoDate(s.first_pay_date), frequency: s.frequency })),
    startingBalanceCents: rows.balance,
  }
}

/**
 * A year of the owner's records, read for the Coach and Savings off the
 * Month's path. Null while it loads; 'failed' when a read failed. The count
 * waiting in Review is the shared load's, added by whoever digests it.
 */
export function useCoachRead(): DigestRows | 'failed' | null {
  const { supabase, version, today } = useAppData()
  const [read, setRead] = useState<DigestRows | 'failed' | null>(null)

  useEffect(() => {
    // Nothing is read before the first load brings the categories (N35).
    if (version === 0) return
    let live = true
    const asOf = today
    const { start, end } = monthBounds(isoDate(asOf))
    const readFrom = shiftMonth(start, -12)
    // The forecast's own reads fail on their own: without them the cards and goals still show.
    const forecast: Promise<ForecastRows> = Promise.all([listPaySchedules(supabase, 'read'), getMonthBalance(supabase, start)]).then(
      ([schedules, balance]): ForecastRows => ({ status: 'ready', schedules, balance }),
      (cause: unknown): ForecastRows => ({ status: 'failed', missingUpdate: needsOneTimeUpdate(cause) }),
    )
    // Budgets and bills typed for the three months ahead too (F35): a rent
    // rise from November counts from November. Every rule resolves the row in
    // effect in the month it asks about, so a later row changes nothing before it.
    const ahead = shiftMonth(start, 3)
    Promise.all([
      listTransactions(supabase, { from: readFrom, to: end }),
      listBudgetHistory(supabase, ahead),
      listPlanHistory(supabase, ahead, 'month'),
      latestStatementEnd(supabase),
      readRecordsStart(supabase),
      forecast,
    ])
      .then(([rows, budgets, plans, statementEnds, records, forecastRows]) => {
        if (live) setRead({ asOf, readFrom, rows, budgets, plans, statementEnds, records, pending: null, forecast: forecastRows })
      })
      .catch(() => live && setRead('failed'))
    return () => {
      live = false
    }
  }, [supabase, version, today])

  return read
}

/**
 * The Coach's facts. Null while the read, the goals (goalsForCore waits
 * for the funds) or the dismissals load; 'failed' when the read failed or
 * the engine refused a row.
 */
export function useCoachFacts(
  read: DigestRows | 'failed' | null,
  goals: readonly DigestGoal[] | null,
  notSubscriptions: readonly string[] | null,
): FactsDigest | 'failed' | null {
  const { categories, pendingTotal, status } = useAppData()
  return useMemo(() => {
    if (read === null || read === 'failed') return read
    if (goals === null || notSubscriptions === null) return null
    try {
      return digestOf({ ...read, pending: status === 'ready' ? pendingTotal : null }, categories, goals, notSubscriptions)
    } catch {
      return 'failed'
    }
  }, [read, goals, notSubscriptions, categories, pendingTotal, status])
}
