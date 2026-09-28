import { useEffect, useMemo, useState } from 'react'
import {
  isoDate,
  monthBounds,
  periodComparison,
  shiftMonth,
  yearSheet,
  type PeriodComparison,
  type YearGroups,
  type YearSheet,
} from '@budget/core'
import { useAppData } from '../app-data.js'
import { useEarlier } from '../earlier.js'
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
import { formatAmount, formatCents, formatMonthName, formatMonthTitle, formatShortMonth, MONTH_NAMES, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { useWide } from '../lib/wide.js'
import { AnnualCharts } from './YearCharts.js'
import { YearGlance } from './YearGlance.js'
import { PeriodSwitch } from './PeriodSwitch.js'
import { HelpButton } from '../help/HelpButton.js'
import { LINE_BUTTON } from '../components/ui/link.js'

/**
 * The workbook's Annual Budget (plan §6.4): twelve months from a start month the
 * owner picks (Annual!D6), which the address holds as `#/year/YYYY-MM`.
 * With none it is this calendar year, from January, as the workbook's sample is.
 * Today is Annual's Current Month (D7): a bill's planned amount counts up
 * to this month and not after (F10), and this month's row is marked as
 * the workbook's conditional format marks it.
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
  const [group, setGroup] = useState<GroupKey>('income')
  const wide = useWide()

  useEffect(() => {
    // As on the Month (N35): rows read before the app's first load name
    // categories core has not been given yet.
    if (version === 0) return
    let live = true
    setError(null)
    Promise.all([
      listTransactions(supabase, { from: start, to: end }),
      // Worded for the year: under "Could not load this year" they said "this month" (N42).
      listBudgetHistory(supabase, last, 'year'),
      listPlanHistory(supabase, last, 'year'),
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

  // The twelve months before, for "vs last year" (F25, D26). Read on its
  // own, so if it fails only the comparison goes.
  const earlier = useEarlier({ from: shiftMonth(start, -12), to: monthBounds(shiftMonth(start, -1)).end })
  const comparison = useMemo((): PeriodComparison | 'failed' | null => {
    if (here === null || earlier === null) return null
    if (earlier === 'failed') return 'failed'
    try {
      return periodComparison({
        period: 'year',
        startMonth: start,
        asOf: isoDate(today),
        historyStart: earlier.historyStart === null ? null : isoDate(earlier.historyStart),
        categories: categoriesForCore(categories),
        planHistory: plansForCore(here.plans),
        entries: entriesForCore([...here.rows, ...earlier.rows]),
      })
    } catch {
      // As the Year's own sheet: a row naming a category that did not load.
      return 'failed'
    }
  }, [here, earlier, categories, start, today])

  return (
    <div className="space-y-4">
      <PeriodSwitch current="year" />
      <header className="-mx-4 max-[359px]:-mx-3 bg-year-header px-4 max-[359px]:px-3 py-4 text-year-header-ink md:mx-0 md:rounded-xl">
        <div className="flex flex-wrap items-center gap-1">
          <h1 className="font-serif text-4xl italic">Year</h1>
          <HelpButton screen="year" />
        </div>
        <p className="mt-1 text-sm">
          {formatMonthTitle(start)} to {formatMonthTitle(last)}
        </p>
      </header>
      <StartPicker start={start} today={today} />
      <p className="text-sm text-muted-foreground">
        Planned bills count up to {formatMonthTitle(thisMonth)}, this month. Later months show only what was charged or
        typed.
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

      {sheet !== null && typeof sheet !== 'string' ? (
        <>
          <YearGlance sheet={sheet} wide={wide} comparison={comparison} />
          {wide ? (
            // Annual's own arrangement on its cream: the totals panel and
            // Income, Expenses and Savings across the top (A6:X21), then
            // Bills, Debts, Subscriptions and Variable expenses (B25:X41).
            <div className="grid grid-cols-4 gap-4 rounded-xl bg-muted p-4">
              <YearTotals sheet={sheet} thisMonth={thisMonth} />
              {GROUPS.slice(0, 3).map((g) => (
                <YearTable key={g.key} sheet={sheet} group={g.key} thisMonth={thisMonth} compact />
              ))}
              {/* Annual's chart row, between its top and bottom cards. */}
              <AnnualCharts sheet={sheet} wide className="col-span-4" />
              {GROUPS.slice(3).map((g) => (
                <YearTable key={g.key} sheet={sheet} group={g.key} thisMonth={thisMonth} compact />
              ))}
            </div>
          ) : (
            <>
              <div role="group" aria-label="Table" className="flex flex-wrap gap-1.5">
                {GROUPS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    aria-pressed={group === g.key}
                    onClick={() => setGroup(g.key)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium pointer-coarse:min-h-11',
                      group === g.key ? 'border-year-header bg-year-header text-year-header-ink' : 'bg-card',
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <YearTable sheet={sheet} group={group} thisMonth={thisMonth} />
              <AnnualCharts sheet={sheet} wide={false} />
            </>
          )}
        </>
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
  const select = 'rounded-md border border-input bg-card px-2 py-1.5 pointer-coarse:min-h-11'
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Starts in</span>
      <select
        aria-label="Start month"
        className={select}
        value={month}
        onChange={(e) => navigate('year', `${year}-${e.target.value}`)}
      >
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, '0')}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label="Start year"
        className={select}
        value={year}
        onChange={(e) => navigate('year', `${e.target.value}-${month}`)}
      >
        {years.map((y) => (
          <option key={y}>{y}</option>
        ))}
      </select>
    </div>
  )
}

type GroupKey = keyof YearGroups
type Tone = 'income' | 'savings' | 'owed' | 'variable'

/**
 * Annual's seven cards: Income, Expenses and Savings across the top (H3:X21)
 * and Bills, Debts, Subscriptions and Variable expenses below (B25:X41),
 * each in its Month block's colours. Expenses are the four added (P10, Q10).
 */
const GROUPS: readonly { key: GroupKey; label: string; heading: string; budget: 'Goal' | 'Budgeted'; tone: Tone }[] = [
  { key: 'income', label: 'Income', heading: 'Income', budget: 'Goal', tone: 'income' },
  { key: 'expenses', label: 'Expenses', heading: 'Expenses', budget: 'Budgeted', tone: 'owed' },
  { key: 'savings', label: 'Savings', heading: 'Savings', budget: 'Goal', tone: 'savings' },
  { key: 'bill', label: 'Bills', heading: 'Bills', budget: 'Budgeted', tone: 'owed' },
  { key: 'debt', label: 'Debts', heading: 'Debts', budget: 'Budgeted', tone: 'owed' },
  { key: 'subscription', label: 'Subscriptions', heading: 'Subscriptions', budget: 'Budgeted', tone: 'owed' },
  { key: 'variable', label: 'Variable', heading: 'Variable expenses', budget: 'Budgeted', tone: 'variable' },
]

const TONE: Record<Tone, { band: string; header: string; total: string; ink: string; rule: string }> = {
  income: {
    band: 'bg-income-band',
    header: 'bg-income-header',
    total: 'bg-income-total',
    ink: 'text-income-ink',
    rule: 'border-income-rule',
  },
  savings: {
    band: 'bg-savings-band',
    header: 'bg-savings-header',
    total: 'bg-savings-total',
    ink: 'text-savings-ink',
    rule: 'border-savings-rule',
  },
  owed: {
    band: 'bg-owed-band',
    header: 'bg-owed-header',
    total: 'bg-owed-total',
    ink: 'text-owed-ink',
    rule: 'border-owed-rule',
  },
  variable: {
    band: 'bg-variable-band',
    header: 'bg-variable-header',
    total: 'bg-variable-total',
    ink: 'text-variable-ink',
    rule: 'border-variable-rule',
  },
}

/**
 * One card: its heading and Actual total on the band, then a row a month.
 * A zero stays blank, as the workbook's `"$"#,##0.00;;` leaves it, so a month the
 * gate has not reached reads as not yet rather than as $0; a negative keeps
 * its minus sign (D8). The totals row adds twelve months (D7).
 */
function YearTable({
  sheet,
  group,
  thisMonth,
  compact = false,
}: {
  sheet: YearSheet
  group: GroupKey
  thisMonth: string
  /** Four across a desktop: the workbook's smaller type, and months as `Sep 2026`. */
  compact?: boolean
}) {
  const g = GROUPS.find((x) => x.key === group)!
  const tone = TONE[g.tone]
  const total = sheet.totals[group]
  const blank = (c: number) => (c === 0 ? '' : formatAmount(c))
  return (
    <section
      aria-label={`${g.heading} by month`}
      className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', tone.rule)}
    >
      <div className={cn('flex items-baseline justify-between gap-3 px-4 py-3', tone.band, tone.ink)}>
        <h2 className="text-sm font-semibold uppercase tracking-wide">{g.heading}</h2>
        <Figure className="text-lg font-bold">{formatCents(total.actualCents)}</Figure>
      </div>
      <table className={cn('w-full', compact ? 'text-xs' : 'text-sm')}>
        <thead className={cn(tone.header, tone.ink)}>
          <tr>
            {['Month', g.budget, 'Actual'].map((name, i) => (
              <th
                key={name}
                scope="col"
                className={cn('px-1 py-1.5 text-xs font-medium', i === 0 ? 'pl-4 text-left' : 'text-right last:pr-4')}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.months.map((m) => (
            <tr
              key={m.month}
              aria-current={m.month === thisMonth ? 'date' : undefined}
              className={cn('border-t', tone.rule, m.month === thisMonth ? 'bg-year-today' : 'even:bg-year-row-alt')}
            >
              <th scope="row" className="py-1.5 pl-4 pr-1 text-left font-normal">
                {compact ? formatShortMonth(m.month) : formatMonthTitle(m.month)}
              </th>
              <td className="tnum px-1 py-1.5 text-right">{blank(m[group].budgetCents)}</td>
              <td className={cn('tnum py-1.5 pl-1 pr-4 text-right', m[group].actualCents < 0 && 'text-spend')}>
                {blank(m[group].actualCents)}
              </td>
            </tr>
          ))}
          <tr className={cn('border-t font-semibold', tone.rule, tone.total, tone.ink)}>
            <th scope="row" className="py-1.5 pl-4 pr-1 text-left">
              Total
            </th>
            <td className="tnum px-1 py-1.5 text-right">{formatAmount(total.budgetCents)}</td>
            <td className="tnum py-1.5 pl-1 pr-4 text-right">{formatAmount(total.actualCents)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

/**
 * Annual's left panel (A6:F21): the start and current month, then the
 * year's totals, Left over (F12, decision 15) and the balances (D18, D20),
 * in the Month summary card's colours, which are the workbook's for both. Until
 * the start month's balance is typed, it says where to type it.
 */
function YearTotals({ sheet, thisMonth }: { sheet: YearSheet; thisMonth: string }) {
  const rows: readonly [string, string][] = [
    ['Starting month', formatMonthTitle(sheet.startMonth)],
    ['Current month', formatMonthTitle(thisMonth)],
    ['Total income', formatCents(sheet.totals.income.actualCents)],
    ['Total expenses', formatCents(sheet.totals.expenses.actualCents)],
    ['Total savings', formatCents(sheet.totals.savings.actualCents)],
    ['Left over', formatCents(sheet.leftOverCents)],
    ['Starting balance', sheet.startingBalanceCents === null ? 'Not yet' : formatCents(sheet.startingBalanceCents)],
    ['Ending balance', sheet.endingBalanceCents === null ? 'Not yet' : formatCents(sheet.endingBalanceCents)],
  ]
  return (
    <section aria-label="Year totals" className="rounded-xl border bg-summary p-4 shadow-sm">
      <dl className="space-y-2.5">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-summary-label">{label}</dt>
            <dd className="font-numbers tnum text-lg font-bold text-summary-value">{value}</dd>
          </div>
        ))}
      </dl>
      {/* As the phone's balances card says: where the missing start is typed (D17). */}
      {sheet.startingBalanceCents === null ? (
        <button
          type="button"
          className={cn('mt-3 text-left text-xs text-summary-label underline underline-offset-4', LINE_BUTTON)}
          onClick={() => navigate('month', sheet.startMonth.slice(0, 7))}
        >
          Type {formatMonthName(sheet.startMonth)}&rsquo;s starting balance on the Month to see these
        </button>
      ) : null}
    </section>
  )
}
