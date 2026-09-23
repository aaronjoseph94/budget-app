import { useEffect, useMemo, useState } from 'react'
import { billsTotals, isoDate, resolvePlans, type BillsTotals, type ResolvedPlan } from '@budget/core'
import { useAppData } from '../app-data.js'
import { listPlanHistory, type PlanRow } from '../ledger.js'

/**
 * Workbook's Bills tab, inside Setup (plan §6.5, S9): a day paid and a monthly
 * amount on every Bills, Debts and Subscriptions row, from this month on
 * (D13), and the totals under them.
 */

/** Setup's monthly amounts: loading, refused with a sentence, or what core resolved for this month. */
export type MonthlyAmounts =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly message: string }
  | {
      readonly status: 'ready'
      /** In effect this month, by category; a category never given one is absent. */
      readonly plans: ReadonlyMap<string, ResolvedPlan>
      /** Null while the categories and the amounts read disagree (see below). */
      readonly totals: BillsTotals | null
      /** They still disagree once both are current: said on screen, never hidden. */
      readonly mismatch: boolean
    }

/**
 * Every monthly amount typed up to `month`, re-read whenever the app's data
 * is (`version`), and resolved by core for that month.
 *
 * Categories and amounts are two reads. Removing a category removes its
 * amounts (0009), and for a moment the amounts read before it still name it,
 * which core refuses to total rather than leave a row out. So the totals wait
 * for the amounts read after the change; only if those still disagree is it
 * a fault worth saying.
 */
export function useMonthlyAmounts(month: string): MonthlyAmounts {
  const { supabase, categories, version } = useAppData()
  const [loaded, setLoaded] = useState<{ month: string; version: number; rows: readonly PlanRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    listPlanHistory(supabase, month)
      .then((rows) => {
        if (!live) return
        setLoaded({ month, version, rows })
        setError(null)
      })
      .catch((e: unknown) => {
        if (!live) return
        setLoaded(null)
        setError(e instanceof Error ? e.message : 'Your monthly amounts could not be read. Try again.')
      })
    return () => {
      live = false
    }
  }, [supabase, month, version])

  return useMemo((): MonthlyAmounts => {
    if (error !== null) return { status: 'failed', message: error }
    if (loaded === null || loaded.month !== month) return { status: 'loading' }
    const history = loaded.rows.map((r) => ({
      categoryId: r.category_id,
      effectiveMonth: isoDate(r.effective_month),
      plannedCents: r.planned_cents,
      dueDay: r.due_day,
    }))
    const asOf = isoDate(month)
    let plans: ReadonlyMap<string, ResolvedPlan>
    try {
      plans = new Map(resolvePlans({ asOf, history }).plans.map((p) => [p.categoryId, p]))
    } catch {
      // Core refuses what 0009 refuses; the database never sends it, so this
      // is a fault, said plainly and never as its message.
      return { status: 'failed', message: 'Your monthly amounts could not be shown. Reload to try again.' }
    }
    try {
      const totals = billsTotals({ month: asOf, categories: categories.map((c) => ({ id: c.id, kind: c.kind })), planHistory: history })
      return { status: 'ready', plans, totals, mismatch: false }
    } catch {
      return { status: 'ready', plans, totals: null, mismatch: loaded.version === version }
    }
  }, [error, loaded, month, categories, version])
}
