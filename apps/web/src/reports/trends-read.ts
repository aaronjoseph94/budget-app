/**
 * What the Reports' Trends read (plan §2.6, A16): the twelve whole months
 * before this one, the monthly amounts in effect over them, and where the
 * records start. Read once for both views: six months is the last half of
 * twelve. Like the Overview, it reads for itself and fails on its own.
 * Nothing here adds or compares; core's monthlyTrend and categoryTrends
 * say what each month came to, and whether a line is steady (F37).
 */
import { useEffect, useState } from 'react'
import { categoryTrends, historyStart, isoDate, monthBounds, monthlyTrend, shiftMonth, type CategoryTrend, type MonthlyTrend } from '@budget/core'
import { useAppData } from '../app-data.js'
import { listPlanHistory, listTransactions, needsOneTimeUpdate, readRecordsStart, type Category } from '../ledger.js'
import { categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import type { ReportRows } from './read.js'

/** The longer view's months. */
const MONTHS = 12

export type TrendsRead =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly missingUpdate: boolean }
  | { readonly status: 'ready'; readonly rows: Omit<ReportRows, 'month'> }

/** The twelve months before asOf's, read again whenever the shared data changes. */
export function useTrendsRead(asOf: string): TrendsRead {
  const { supabase, version } = useAppData()
  const [read, setRead] = useState<{ key: string; read: TrendsRead } | null>(null)
  const key = `${asOf}|${version}`

  useEffect(() => {
    // Nothing is read before the first load brings the categories (N35).
    if (version === 0) return
    let live = true
    const last = shiftMonth(isoDate(asOf), -1)
    const readFrom = shiftMonth(isoDate(asOf), -MONTHS)
    Promise.all([listTransactions(supabase, { from: readFrom, to: monthBounds(last).end }), listPlanHistory(supabase, last, 'month'), readRecordsStart(supabase)])
      .then(([rows, plans, records]) => {
        if (live) setRead({ key, read: { status: 'ready', rows: { asOf, readFrom, rows, plans, records } } })
      })
      .catch((cause: unknown) => {
        if (live) setRead({ key, read: { status: 'failed', missingUpdate: needsOneTimeUpdate(cause) } })
      })
    return () => {
      live = false
    }
  }, [supabase, asOf, version, key])

  // A read for another day is not this one's.
  return read?.key === key ? read.read : { status: 'loading' }
}

export interface TrendFigures {
  readonly totals: MonthlyTrend
  readonly categories: readonly CategoryTrend[]
}

/** The rows, renamed for core, through monthlyTrend and categoryTrends over 6 or 12 months. Throws where the engine refuses a row. */
export function trendsOf(rows: Omit<ReportRows, 'month'>, categories: readonly Category[], months: 6 | 12): TrendFigures {
  const input = {
    asOf: isoDate(rows.asOf),
    historyStart: historyStart({
      statementPeriodStarts: rows.records.statementStarts.map((d) => isoDate(d)),
      entryDates: rows.records.entryDates.map((d) => isoDate(d)),
    }).start,
    readFrom: isoDate(rows.readFrom),
    months,
    categories: categoriesForCore(categories),
    entries: entriesForCore(rows.rows),
  }
  return { totals: monthlyTrend({ ...input, planHistory: plansForCore(rows.plans) }), categories: categoryTrends(input).categories }
}
