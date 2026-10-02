/**
 * What a month's review reads (plan §2.6, A15): the month and the six
 * before it, so the usual month has up to six whole months to stand on
 * (F27, F36), the monthly amounts in effect, and where the records start.
 * Reports reads for itself, off the Month's path, and fails on its own:
 * nothing else waits for it. Nothing here adds or compares; core's
 * monthReport says what the month came to.
 */
import { useEffect, useState } from 'react'
import { isoDate, monthBounds, monthReport, shiftMonth, type MonthReport } from '@budget/core'
import { useAppData } from '../app-data.js'
import { listPlanHistory, listTransactions, needsOneTimeUpdate, readRecordsStart, type Category, type LedgerRow, type PlanRow } from '../ledger.js'
import { categoriesForCore, entriesForCore, historyFrom, type RecordsStart, plansForCore } from '../sheet-input.js'

/** Months read before the one reviewed: the usual month's six. */
const BEFORE = 6

export interface ReportRows {
  readonly asOf: string
  readonly month: string
  readonly readFrom: string
  readonly rows: readonly LedgerRow[]
  readonly plans: readonly PlanRow[]
  readonly records: RecordsStart
}

export type ReportRead =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly missingUpdate: boolean }
  | { readonly status: 'ready'; readonly rows: ReportRows }

/** The month's rows, read again whenever the month or the shared data changes. */
export function useReportRead(month: string, asOf: string): ReportRead {
  const { supabase, version } = useAppData()
  const [read, setRead] = useState<{ key: string; read: ReportRead } | null>(null)
  const key = `${month}|${asOf}|${version}`

  useEffect(() => {
    // Nothing is read before the first load brings the categories (N35).
    if (version === 0) return
    let live = true
    const { start, end } = monthBounds(isoDate(month))
    const readFrom = shiftMonth(start, -BEFORE)
    Promise.all([listTransactions(supabase, { from: readFrom, to: end }), listPlanHistory(supabase, start, 'month'), readRecordsStart(supabase)])
      .then(([rows, plans, records]) => {
        if (live) setRead({ key, read: { status: 'ready', rows: { asOf, month: start, readFrom, rows, plans, records } } })
      })
      .catch((cause: unknown) => {
        if (live) setRead({ key, read: { status: 'failed', missingUpdate: needsOneTimeUpdate(cause) } })
      })
    return () => {
      live = false
    }
  }, [supabase, month, asOf, version, key])

  // A read for another month is not this one's.
  return read?.key === key ? read.read : { status: 'loading' }
}

export interface ReportFigures {
  readonly report: MonthReport
  /** Where the records start (F24), for the screen to say so. */
  readonly historyStart: string | null
}

/** The rows, renamed for core, through monthReport. Throws where the engine refuses a row. */
export function reportOf(rows: ReportRows, categories: readonly Category[]): ReportFigures {
  const start = historyFrom(rows.records)
  const report = monthReport({
    asOf: isoDate(rows.asOf),
    month: isoDate(rows.month),
    historyStart: start,
    readFrom: isoDate(rows.readFrom),
    categories: categoriesForCore(categories),
    planHistory: plansForCore(rows.plans),
    entries: entriesForCore(rows.rows),
  })
  return { report, historyStart: start }
}
