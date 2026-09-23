/**
 * The debts, read and worked out by packages/core, for the Debts screen and
 * the Year's debt chart.
 *
 * Every figure is core's: each schedule from its own start month (debtPlan),
 * where each debt stands today (debtStatus, F22), and the three payoff plans
 * side by side (payoffStrategies, F23). This reads the rows and hands them
 * over. Balances are for today, as the Debt Calculator and Home show them,
 * and come from the schedule alone, as Workbook's do (NOTICED N53).
 */
import { useEffect, useMemo, useState } from 'react'
import {
  debtPlan,
  debtStatus,
  isoDate,
  payoffStrategies,
  type DebtPlan,
  type DebtPlanInput,
  type DebtStatus,
  type PayoffStrategies,
} from '@budget/core'
import { useAppData } from './app-data.js'
import { listDebtExtras, listDebts, type DebtExtraRow, type DebtRow } from './ledger.js'
import { todayIso } from './format.js'

export interface DebtsFigures {
  readonly asOf: string
  readonly rows: readonly DebtRow[]
  readonly extras: readonly DebtExtraRow[]
  readonly plan: DebtPlan
  /** Null with no debt that is ever paid off. */
  readonly status: DebtStatus | null
  /** Null with no debts. */
  readonly strategies: PayoffStrategies | null
}

export type DebtsState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly message: string }
  | ({ readonly status: 'ready' } & { readonly debts: DebtsFigures })

/** The rows in core's terms: a debt by its name, an extra by its debt's name. */
export function debtsForCore(rows: readonly DebtRow[], extras: readonly DebtExtraRow[]): DebtPlanInput {
  return {
    debts: rows.map((d) => ({
      name: d.name,
      startMonth: isoDate(d.start_date),
      startingBalanceCents: d.starting_balance_cents,
      minimumPaymentCents: d.minimum_payment_cents,
      aprBasisPoints: d.apr_basis_points,
    })),
    extraPayments: extras.flatMap((e) => {
      const debt = rows.find((d) => d.id === e.debt_id)
      return debt === undefined ? [] : [{ debtName: debt.name, month: isoDate(e.month), amountCents: e.amount_cents }]
    }),
  }
}

export function useDebts(): DebtsState {
  const { supabase, version } = useAppData()
  const [loaded, setLoaded] = useState<{ asOf: string; rows: readonly DebtRow[]; extras: readonly DebtExtraRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const asOf = todayIso()
    setError(null)
    Promise.all([listDebts(supabase), listDebtExtras(supabase)])
      .then(([rows, extras]) => live && setLoaded({ asOf, rows, extras }))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load your debts.'))
    return () => {
      live = false
    }
  }, [supabase, version])

  return useMemo((): DebtsState => {
    if (error !== null) return { status: 'failed', message: error }
    if (loaded === null) return { status: 'loading' }
    try {
      const input = debtsForCore(loaded.rows, loaded.extras)
      const plan = debtPlan(input)
      const status = plan.amortization === null ? null : debtStatus({ amortization: plan.amortization, asOf: isoDate(loaded.asOf) })
      return { status: 'ready', debts: { ...loaded, plan, status, strategies: payoffStrategies(input) } }
    } catch {
      return { status: 'failed', message: 'A debt could not be read as the app expects, so your debts are not shown. Reload to try again.' }
    }
  }, [loaded, error])
}
