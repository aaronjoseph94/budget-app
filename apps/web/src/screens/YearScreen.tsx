import { useEffect, useMemo, useState } from 'react'
import { isoDate, monthBounds, shiftMonth, yearSheet, type YearSheet } from '@budget/core'
import { useAppData } from '../app-data.js'
import {
  getMonthBalance,
  listBudgetHistory,
  listPlanHistory,
  listTransactions,
  type BudgetRow,
  type LedgerRow,
  type PlanRow,
} from '../ledger.js'
import { navigate } from '../nav.js'
import { budgetsForCore, categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import { MONTH_NAMES, formatMonthTitle, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'

/**
 * Workbook's Annual Budget (plan §6.4): twelve months from a start month the
 * owner picks (Annual!D6), which the address holds as `#/year/YYYY-MM`.
 * With none it is this calendar year, from January, as Workbook's sample is.
 * Today is Annual's Current Month (D7): a bill's planned amount counts up
 * to this month and not after (F10), and this month's row is marked as
 * Workbook's conditional format marks it.
 *
 * Every number is yearSheet's, from packages/core, over the twelve months'
 * ledger, every budget and monthly amount typed up to the last of them, and
 * the start month's typed balance; this screen only formats them.
 */
export function YearScreen({ start: address }: { start: string | null }) {
  const { supabase, categories, pendingTotal, loadError, version } = useAppData()
  const today = todayIso()
  const start = monthBounds(isoDate(address === null ? `${today.slice(0, 4)}-01-01` : `${address}-01`)).start
  const last = shiftMonth(start, 11)
  const end = monthBounds(last).end
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // As on the Month (N35): rows read before the app's first load name
    // categories core has not been given yet.
    if (version === 0) return
    let live = true
    setError(null)
    Promise.all([
      listTransactions(supabase, { from: start, to: end }),
      listBudgetHistory(supabase, last),
      listPlanHistory(supabase, last, 'month'),
      getMonthBalance(supabase, start),
    ])
      .then(([rows, budgets, plans, balance]) => live && setLoaded({ start, rows, budgets, plans, balance }))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load this year.'))
    return () => {
      live = false
    }
  }, [supabase, start, last, end, version])

  // Another start's rows never fill this one's months.
  const here = loaded !== null && loaded.start === start ? loaded : null
  const sheet = useMemo((): YearSheet | string | null => {
    if (here === null) return null
    try {
      return yearSheet({
        startMonth: start,
        asOf: isoDate(today),
        categories: categoriesForCore(categories),
        budgetHistory: budgetsForCore(here.budgets),
        planHistory: plansForCore(here.plans),
        entries: entriesForCore(here.rows),
        startingBalances: here.balance === null ? [] : [{ month: start, cents: here.balance }],
      })
    } catch {
      // Said plainly, never as the engine's message, as on the Month.
      return 'A charge, a budget or a monthly amount this year names a category that did not load, so the year is not shown. Reload to try again.'
    }
  }, [here, categories, start, today])
  const thisMonth = monthBounds(isoDate(today)).start

  return (
    <div className="space-y-4">
      <header className="-mx-4 bg-year-header px-4 py-4 text-year-header-ink md:mx-0 md:rounded-xl">
        <h1 className="font-serif text-4xl italic">Year</h1>
        <p className="mt-1 text-sm">
          {formatMonthTitle(start)} to {formatMonthTitle(last)}
        </p>
      </header>
      <StartPicker start={start} today={today} />
      <p className="text-sm text-muted-foreground">
        Planned bills count up to {formatMonthTitle(thisMonth)}, this month. Later months show only what was
        charged or typed.
      </p>

      {error !== null ? (
        <Alert tone="error" title="Could not load this year">
          {error}
        </Alert>
      ) : null}
      {typeof sheet === 'string' ? (
        <Alert tone="error" title="Could not show this year">
          {sheet}
        </Alert>
      ) : null}
      {sheet === null && error === null && (version > 0 || loadError === null) ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : null}
      {pendingTotal > 0 ? (
        <button
          type="button"
          onClick={() => navigate('review')}
          className="w-full rounded-xl border bg-card px-4 py-3 text-left text-sm shadow-sm hover:bg-accent"
        >
          {pendingTotal} waiting for review — not counted below
        </button>
      ) : null}
    </div>
  )
}

interface Loaded {
  readonly start: string
  readonly rows: readonly LedgerRow[]
  readonly budgets: readonly BudgetRow[]
  readonly plans: readonly PlanRow[]
  /** The start month's typed balance, or null when none was. */
  readonly balance: number | null
}

/**
 * Annual!D6, "Choose any month you'd like to see a 12-Month Budget display
 * for": a month and a year, each a native picker, which a phone shows as a
 * wheel. Years run from five before this one to the next, and always
 * include the start's own.
 */
function StartPicker({ start, today }: { start: string; today: string }) {
  const [year, month] = start.split('-') as [string, string]
  const thisYear = Number(today.slice(0, 4))
  const from = Math.min(thisYear - 5, Number(year))
  const years = Array.from({ length: Math.max(thisYear + 1, Number(year)) - from + 1 }, (_, i) => String(from + i))
  const select = 'rounded-md border bg-card px-2 py-1.5'
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Starts in</span>
      <select aria-label="Start month" className={select} value={month} onChange={(e) => navigate('year', `${year}-${e.target.value}`)}>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, '0')}>
            {name}
          </option>
        ))}
      </select>
      <select aria-label="Start year" className={select} value={year} onChange={(e) => navigate('year', `${e.target.value}-${month}`)}>
        {years.map((y) => (
          <option key={y}>{y}</option>
        ))}
      </select>
    </div>
  )
}

