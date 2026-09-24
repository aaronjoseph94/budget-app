/**
 * The earlier window's ledger rows and where the records start (F24), for a
 * screen's comparison with the period before (F25, D26).
 *
 * Read beside the screen's own read, never inside it, so a failure here costs
 * the comparison alone and the screen still shows (plan §6, as the Month
 * does). Which days are compared, and whether the records reach them, is
 * core's to say; this only reads the rows.
 */
import { useEffect, useState } from 'react'
import { historyStart, isoDate } from '@budget/core'
import { useAppData } from './app-data.js'
import { listTransactions, readRecordsStart, type LedgerRow } from './ledger.js'

export interface EarlierRead {
  /** Every row from `from` to `to`; core keeps the days it compares. */
  readonly rows: readonly LedgerRow[]
  /** F24's history start, or null with no records. */
  readonly historyStart: string | null
}

/** Null while it loads, or while another window's answer is still the last one in. */
export type Earlier = EarlierRead | 'failed' | null

export function useEarlier(range: { readonly from: string; readonly to: string } | null): Earlier {
  const { supabase, version } = useAppData()
  const from = range?.from ?? null
  const to = range?.to ?? null
  const key = from === null || to === null ? null : `${from} ${to}`
  const [read, setRead] = useState<{ key: string; value: EarlierRead | 'failed' } | null>(null)

  useEffect(() => {
    // As every screen's own read: nothing before the first load brings the categories (N35).
    if (version === 0 || from === null || to === null) return
    const asked = `${from} ${to}`
    let live = true
    Promise.all([listTransactions(supabase, { from, to }), readRecordsStart(supabase)])
      .then(([rows, records]) => {
        const start = historyStart({
          statementPeriodStarts: records.statementStarts.map((d) => isoDate(d)),
          entryDates: records.entryDates.map((d) => isoDate(d)),
        }).start
        if (live) setRead({ key: asked, value: { rows, historyStart: start } })
      })
      .catch(() => live && setRead({ key: asked, value: 'failed' }))
    return () => {
      live = false
    }
  }, [supabase, from, to, version])

  return read !== null && read.key === key ? read.value : null
}
