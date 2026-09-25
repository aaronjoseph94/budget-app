/**
 * The Coach's facts: every row the digest needs, read for the Coach and
 * handed to packages/core's factsDigest (plan A07).
 *
 * The Coach reads twelve months back itself, off the Month's path, so the
 * usual month, a goal's pace and its levers have up to six complete months
 * to stand on (F27, F33, F34); Savings reads the same year. Nothing here
 * adds or compares: which months are complete, what changed and what is
 * worth a card is core's to say. A failed read or an engine refusal fails
 * the cards alone; the flight card beside them still shows.
 */
import { useEffect, useMemo, useState } from 'react'
import { factsDigest, historyStart, isoDate, monthBounds, shiftMonth, type DigestGoal, type FactsDigest } from '@budget/core'
import { useAppData } from '../app-data.js'
import { todayIso } from '../format.js'
import {
  latestStatementEnd,
  listBudgetHistory,
  listPlanHistory,
  listTransactions,
  readRecordsStart,
  type BudgetRow,
  type Category,
  type LedgerRow,
  type PlanRow,
} from '../ledger.js'
import { budgetsForCore, categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'

/** What the digest reads, as the database gave it. */
export interface DigestRows {
  readonly asOf: string
  /** The first day `rows` covers. */
  readonly readFrom: string
  readonly rows: readonly LedgerRow[]
  readonly budgets: readonly BudgetRow[]
  readonly plans: readonly PlanRow[]
  readonly statementEnds: readonly string[]
  readonly records: { readonly statementStarts: readonly string[]; readonly entryDates: readonly string[] }
  /** Rows waiting in Review, or null when that count did not load. */
  readonly pending: number | null
}

/** Where the records start (F24), from what was read. */
export function historyOf(read: DigestRows): ReturnType<typeof historyStart>['start'] {
  return historyStart({
    statementPeriodStarts: read.records.statementStarts.map((d) => isoDate(d)),
    entryDates: read.records.entryDates.map((d) => isoDate(d)),
  }).start
}

/**
 * The rows, renamed for core, through factsDigest. Throws where the engine
 * refuses a row. The goals are the active ones, main first, whose
 * milestones are cheered; the Month, which shows only the day's line, gives
 * none.
 */
export function digestOf(read: DigestRows, categories: readonly Category[], goals: readonly DigestGoal[] = []): FactsDigest {
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
  })
}

/**
 * A year of the owner's records, read for the Coach and Savings off the
 * Month's path. Null while it loads; 'failed' when a read failed. The count
 * waiting in Review is the shared load's, added by whoever digests it.
 */
export function useCoachRead(): DigestRows | 'failed' | null {
  const { supabase, version } = useAppData()
  const [read, setRead] = useState<DigestRows | 'failed' | null>(null)

  useEffect(() => {
    // Nothing is read before the first load brings the categories (N35).
    if (version === 0) return
    let live = true
    const asOf = todayIso()
    const { start, end } = monthBounds(isoDate(asOf))
    const readFrom = shiftMonth(start, -12)
    Promise.all([
      listTransactions(supabase, { from: readFrom, to: end }),
      listBudgetHistory(supabase, start),
      listPlanHistory(supabase, start, 'month'),
      latestStatementEnd(supabase),
      readRecordsStart(supabase),
    ])
      .then(([rows, budgets, plans, statementEnds, records]) => {
        if (live) setRead({ asOf, readFrom, rows, budgets, plans, statementEnds, records, pending: null })
      })
      .catch(() => live && setRead('failed'))
    return () => {
      live = false
    }
  }, [supabase, version])

  return read
}

/**
 * The Coach's facts. Null while the read or the goals load (goalsForCore
 * waits for the funds); 'failed' when the read failed or the engine refused
 * a row.
 */
export function useCoachFacts(read: DigestRows | 'failed' | null, goals: readonly DigestGoal[] | null): FactsDigest | 'failed' | null {
  const { categories, pendingTotal, status } = useAppData()
  return useMemo(() => {
    if (read === null || read === 'failed') return read
    if (goals === null) return null
    try {
      return digestOf({ ...read, pending: status === 'ready' ? pendingTotal : null }, categories, goals)
    } catch {
      return 'failed'
    }
  }, [read, goals, categories, pendingTotal, status])
}
