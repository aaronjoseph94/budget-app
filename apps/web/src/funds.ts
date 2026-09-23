/**
 * The savings funds, read and laid out by packages/core (savingsFunds), for
 * the Savings screen and the Year's savings-goals chart.
 *
 * Every figure is core's: the balance kept by transfers (D16), the plan
 * (F21), the bar's basis points. This reads the rows and hands them over.
 * Balances are for today, as Workbook's Savings tab and Home show them.
 */
import { useEffect, useMemo, useState } from 'react'
import { isoDate, savingsFunds, type SavingsFunds } from '@budget/core'
import { useAppData } from './app-data.js'
import { listFundTransfers, listFunds, type FundRow, type LedgerRow } from './ledger.js'
import { categoriesForCore } from './sheet-input.js'
import { todayIso } from './format.js'

export type FundsState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'ready'; readonly asOf: string; readonly goals: readonly FundRow[]; readonly funds: SavingsFunds }

export function useFunds(): FundsState {
  const { supabase, categories, version } = useAppData()
  const [loaded, setLoaded] = useState<{ asOf: string; goals: readonly FundRow[]; rows: readonly LedgerRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Nothing is read before the first load brings the categories (N35).
    if (version === 0) return
    let live = true
    const asOf = todayIso()
    setError(null)
    listFunds(supabase)
      .then(async (goals) => {
        // From the earliest typed day: core counts each fund's rows only after its own.
        const linked = goals.flatMap((g) =>
          g.category_id !== null && g.balance_as_of !== null ? [{ fund: g.category_id, since: g.balance_as_of }] : [],
        )
        const from = linked.map((l) => l.since).sort()[0]
        const rows =
          from === undefined ? [] : await listFundTransfers(supabase, linked.map((l) => l.fund), { from, to: asOf })
        if (live) setLoaded({ asOf, goals, rows })
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load your savings funds.'))
    return () => {
      live = false
    }
  }, [supabase, version])

  return useMemo((): FundsState => {
    if (error !== null) return { status: 'failed', message: error }
    if (loaded === null) return { status: 'loading' }
    try {
      const funds = savingsFunds({
        asOf: isoDate(loaded.asOf),
        categories: categoriesForCore(categories),
        goals: loaded.goals.map((g) => ({
          id: g.id,
          categoryId: g.category_id,
          goalCents: g.target_cents,
          typedCents: g.saved_cents,
          typedOn: g.balance_as_of === null ? null : isoDate(g.balance_as_of),
          startDate: g.start_date === null ? null : isoDate(g.start_date),
          goalDate: g.target_date === null ? null : isoDate(g.target_date),
        })),
        entries: loaded.rows.map((r) => ({ postedOn: isoDate(r.posted_on), amountCents: r.amount_cents, categoryId: r.category_id })),
      })
      return { status: 'ready', asOf: loaded.asOf, goals: loaded.goals, funds }
    } catch {
      return { status: 'failed', message: 'A savings goal could not be read as the app expects, so your funds are not shown. Reload to try again.' }
    }
  }, [loaded, error, categories])
}
