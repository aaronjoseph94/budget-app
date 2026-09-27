/**
 * What the Reports' Habits read (plan §2.6, A18): the twelve months before
 * this one and this month to today, and where the records start. Twelve
 * months hold the grid's 26 weeks, the weekday pattern's 12 and the
 * personal bests' 12 whole months. Like the other tabs, it reads for
 * itself and fails on its own. Nothing here adds or compares; core's
 * spendingGrid, weekdayPattern, streaks and personalBest say what each
 * day, weekday, week and month came to (F40).
 */
import { useEffect, useState } from 'react'
import {
  historyStart,
  isoDate,
  personalBest,
  shiftMonth,
  spendingGrid,
  streaks,
  weekdayPattern,
  type PersonalBests,
  type SpendingGrid,
  type Streaks,
  type WeekdayPattern,
} from '@budget/core'
import { useAppData } from '../app-data.js'
import { listTransactions, needsOneTimeUpdate, readRecordsStart, type Category, type LedgerRow } from '../ledger.js'
import { entriesForCore, weekCategoriesForCore } from '../sheet-input.js'

/** Months read before this one. */
const MONTHS = 12

export interface HabitRows {
  readonly asOf: string
  readonly readFrom: string
  readonly rows: readonly LedgerRow[]
  readonly records: { readonly statementStarts: readonly string[]; readonly entryDates: readonly string[] }
}

export type HabitsRead =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly missingUpdate: boolean }
  | { readonly status: 'ready'; readonly rows: HabitRows }

/** Twelve months to today, read again whenever the shared data changes. */
export function useHabitsRead(asOf: string): HabitsRead {
  const { supabase, version } = useAppData()
  const [read, setRead] = useState<{ key: string; read: HabitsRead } | null>(null)
  const key = `${asOf}|${version}`

  useEffect(() => {
    // Nothing is read before the first load brings the categories (N35).
    if (version === 0) return
    let live = true
    const readFrom = shiftMonth(isoDate(asOf), -MONTHS)
    Promise.all([listTransactions(supabase, { from: readFrom, to: asOf }), readRecordsStart(supabase)])
      .then(([rows, records]) => {
        if (live) setRead({ key, read: { status: 'ready', rows: { asOf, readFrom, rows, records } } })
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

export interface HabitFigures {
  readonly grid: SpendingGrid
  readonly pattern: WeekdayPattern
  readonly streaks: Streaks
  readonly bests: PersonalBests
}

/** The rows, renamed for core, through F40's four. Throws where the engine refuses a row. */
export function habitsOf(rows: HabitRows, categories: readonly Category[]): HabitFigures {
  const input = {
    asOf: isoDate(rows.asOf),
    historyStart: historyStart({
      statementPeriodStarts: rows.records.statementStarts.map((d) => isoDate(d)),
      entryDates: rows.records.entryDates.map((d) => isoDate(d)),
    }).start,
    readFrom: isoDate(rows.readFrom),
    categories: weekCategoriesForCore(categories),
    entries: entriesForCore(rows.rows),
  }
  return { grid: spendingGrid(input), pattern: weekdayPattern(input), streaks: streaks(input), bests: personalBest(input) }
}
