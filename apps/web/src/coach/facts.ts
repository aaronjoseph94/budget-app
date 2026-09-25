/**
 * The Coach's facts: every row the digest needs, read for the Coach and
 * handed to packages/core's factsDigest (plan A07).
 *
 * The Coach reads twelve months back itself, off the Month's path, so the
 * usual month has up to six complete months to stand on (F27). Nothing here
 * adds or compares: which months are complete, what changed and what is
 * worth a card is core's to say. A failed read or an engine refusal fails
 * the cards alone; the flight card beside them still shows.
 */
import { useEffect, useMemo, useState } from 'react'
import { factsDigest, historyStart, isoDate, monthBounds, shiftMonth, type FactsDigest } from '@budget/core'
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

/** The rows, renamed for core, through factsDigest. Throws where the engine refuses a row. */
export function digestOf(read: DigestRows, categories: readonly Category[]): FactsDigest {
  const latest = read.statementEnds.map((e) => isoDate(e)).sort().at(-1) ?? null
  return factsDigest({
    asOf: isoDate(read.asOf),
    historyStart: historyStart({
      statementPeriodStarts: read.records.statementStarts.map((d) => isoDate(d)),
      entryDates: read.records.entryDates.map((d) => isoDate(d)),
    }).start,
    readFrom: isoDate(read.readFrom),
    categories: categoriesForCore(categories),
    budgetHistory: budgetsForCore(read.budgets),
    planHistory: plansForCore(read.plans),
    entries: entriesForCore(read.rows),
    latestStatementEnd: latest,
    pendingCount: read.pending,
    // The goals' milestones join the Coach's read with the goals themselves, next.
    goals: [],
  })
}

/** Null while it loads; 'failed' when a read failed or the engine refused a row. */
export function useCoachFacts(): FactsDigest | 'failed' | null {
  const { supabase, categories, pendingTotal, status, version } = useAppData()
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

  return useMemo(() => {
    if (read === null || read === 'failed') return read
    try {
      return digestOf({ ...read, pending: status === 'ready' ? pendingTotal : null }, categories)
    } catch {
      return 'failed'
    }
  }, [read, categories, pendingTotal, status])
}
