/**
 * What Reports' Shops tab reads (plan §2.6, A17): the month shown and the
 * 24 months before it, so a yearly charge can show its third payment, and
 * where the records start. Like the Overview, it reads for itself, off the
 * Month's path, and fails on its own. Nothing here adds or compares: core's
 * topShops, recurringCharges and unusualCharges say what each shop came to
 * and what repeats or stands out (F38, F39, F41).
 */
import { useEffect, useState } from 'react'
import {
  isoDate,
  monthBounds,
  recurringCharges,
  shiftMonth,
  topShops,
  unusualCharges,
  type RecurringCharge,
  type TopShops,
  type UnusualCharges,
} from '@budget/core'
import { useAppData } from '../app-data.js'
import { listTransactions, needsOneTimeUpdate, readRecordsStart, type Category, type LedgerRow } from '../ledger.js'
import { categoriesForCore, historyFrom, type RecordsStart, shopEntriesForCore } from '../sheet-input.js'

/** Months read before the one shown. */
const BEFORE = 24

export interface ShopsRows {
  readonly asOf: string
  readonly month: string
  readonly readFrom: string
  readonly rows: readonly LedgerRow[]
  readonly records: RecordsStart
}

export type ShopsRead =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly missingUpdate: boolean }
  | { readonly status: 'ready'; readonly rows: ShopsRows }

/** The month's rows and the two years before, read again whenever the month or the shared data changes. */
export function useShopsRead(month: string, asOf: string): ShopsRead {
  const { supabase, version } = useAppData()
  const [read, setRead] = useState<{ key: string; read: ShopsRead } | null>(null)
  const key = `${month}|${asOf}|${version}`

  useEffect(() => {
    // Nothing is read before the first load brings the categories (N35).
    if (version === 0) return
    let live = true
    const { start, end } = monthBounds(isoDate(month))
    const readFrom = shiftMonth(start, -BEFORE)
    Promise.all([listTransactions(supabase, { from: readFrom, to: end }), readRecordsStart(supabase)])
      .then(([rows, records]) => {
        if (live) setRead({ key, read: { status: 'ready', rows: { asOf, month: start, readFrom, rows, records } } })
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

export interface ShopFigures {
  readonly top: Extract<TopShops, { status: 'ready' }>
  /** As they stood at the end of the window shown: today, for this month. */
  readonly series: readonly RecurringCharge[]
  /** Over the window shown. */
  readonly unusual: UnusualCharges
  readonly historyStart: string | null
}

/**
 * The rows, renamed for core, each with its shop, through topShops,
 * recurringCharges and unusualCharges. Null for a month not begun. Throws
 * where the engine refuses a row.
 */
export function shopsOf(rows: ShopsRows, categories: readonly Category[], notSubscriptions: readonly string[]): ShopFigures | null {
  const start = historyFrom(rows.records)
  const input = { historyStart: start, readFrom: isoDate(rows.readFrom), categories: categoriesForCore(categories), entries: shopEntriesForCore(rows.rows) }
  const top = topShops({ ...input, asOf: isoDate(rows.asOf), month: isoDate(rows.month) })
  if (top.status !== 'ready') return null
  // A month that is over is seen as it stood at its end; this month, as today.
  const { series } = recurringCharges({ ...input, asOf: top.now.to, notSubscriptions })
  return { top, series, unusual: unusualCharges({ ...input, window: top.now }), historyStart: start }
}
