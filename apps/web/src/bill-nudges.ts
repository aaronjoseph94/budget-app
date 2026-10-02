/**
 * Setup's "Looks like a monthly bill: add it?" (plan A17, F38): a monthly
 * charge filed on Bills, Debts or Subscriptions under a category with no
 * monthly amount. Setup reads a year of charges for it, on its own: when
 * the read fails, or 0017's "Not a subscription" marks cannot be read,
 * there is simply no nudge, and Setup works as before. The nudge only
 * fills the bill editor; the owner saves. Which charge, at what price and
 * on which day, is core's recurringCharges and billNudges.
 */
import { useEffect, useMemo, useState } from 'react'
import { billNudges, isoDate, monthBounds, recurringCharges, shiftMonth, type BillNudge } from '@budget/core'
import { useAppData } from './app-data.js'
import { listTransactions, readRecordsStart, type LedgerRow } from './ledger.js'
import { categoriesForCore, historyFrom, type RecordsStart, shopEntriesForCore } from './sheet-input.js'
import { notSubscriptionsOf, useDismissals } from './coach/dismissals.js'
import type { MonthlyAmounts } from './screens/SetupPlans.js'

interface NudgeRows {
  readonly asOf: string
  readonly readFrom: string
  readonly rows: readonly LedgerRow[]
  readonly records: RecordsStart
}

const NONE: ReadonlyMap<string, BillNudge> = new Map()

/** Each category's nudge, by id; none while anything loads or when a read failed. */
export function useBillNudges(amounts: MonthlyAmounts): ReadonlyMap<string, BillNudge> {
  const { supabase, categories, version, today } = useAppData()
  const { dismissed } = useDismissals()
  const [read, setRead] = useState<NudgeRows | null>(null)

  useEffect(() => {
    // Nothing is read before the first load brings the categories (N35).
    if (version === 0) return
    let live = true
    const asOf = today
    const readFrom = shiftMonth(monthBounds(isoDate(asOf)).start, -12)
    Promise.all([listTransactions(supabase, { from: readFrom, to: asOf }), readRecordsStart(supabase)])
      .then(([rows, records]) => live && setRead({ asOf, readFrom, rows, records }))
      // A nudge is a convenience: without it Setup is as it was.
      .catch(() => live && setRead(null))
    return () => void (live = false)
  }, [supabase, version, today])

  return useMemo(() => {
    if (read === null || dismissed === null || amounts.status !== 'ready') return NONE
    try {
      const input = {
        historyStart: historyFrom(read.records),
        readFrom: isoDate(read.readFrom),
        categories: categoriesForCore(categories),
      }
      const { series } = recurringCharges({ ...input, asOf: isoDate(read.asOf), entries: shopEntriesForCore(read.rows), notSubscriptions: notSubscriptionsOf(dismissed) })
      const planned = [...amounts.plans.values()].filter((p) => p.plannedCents !== null).map((p) => p.categoryId)
      return new Map(billNudges({ series, categories: input.categories, plannedCategoryIds: planned }).nudges.map((n) => [n.categoryId, n]))
    } catch {
      return NONE
    }
  }, [read, dismissed, amounts, categories])
}
