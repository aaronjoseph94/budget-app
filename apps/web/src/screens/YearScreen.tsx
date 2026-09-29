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
import { Alert, Loading } from '../components/ui/feedback.js'
import { Figure, MonthTitle } from '../components/ui/type.js'
import { NativeSelect } from '../components/ui/form.js'
import { cn } from '../lib/cn.js'
import { useFourAcross } from '../lib/wide.js'
import { AnnualCharts } from './YearCharts.js'
import { YearGlance } from './YearGlance.js'
import { PeriodSwitch } from './PeriodSwitch.js'
import { WaitingBanner } from './MonthScreen.js'
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
  const wide = useFourAcross()

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
      {/* Mockup A's title row, as the Month's: the title with its ?, the
        twelve months under it, and on the right the start picker. It wraps,
        so on a phone the picker drops under the title. */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            <MonthTitle>Year</MonthTitle>
            <HelpButton screen="year" className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground md:text-base">
            {formatMonthTitle(start)} to {formatMonthTitle(last)}
          </p>
        </div>
        <StartPicker start={start} today={today} />
      </header>
      <p className="text-sm text-muted-foreground">
        Planned bills count up to {formatMonthTitle(thisMonth)}, this month. Later months show only what was charged or
        typed.
      </p>
      {pendingTotal > 0 ? (
        <WaitingBanner>
          <span className="font-semibold">{pendingTotal} waiting for review</span> — not counted below
        </WaitingBanner>
      ) : null}

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
        <Loading what="this year" />
      ) : null}
      {sheet !== null && typeof sheet !== 'string' ? (
        <>
          <YearGlance sheet={sheet} wide={wide} comparison={comparison} />
          {wide ? (
            // Design-review P2 item 7: from 1280px all seven tables at once,
            // four across in Annual's arrangement: the totals panel and
            // Income, Expenses and Savings (A6:X21), the chart row, then
            // Bills, Debts, Subscriptions and Variable expenses (B25:X41).
            <div className="grid grid-cols-4 gap-3 min-[1400px]:gap-4">
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
              {/* Narrower, the chips choose one table; from 1024px it has
                the charts beside it, as Mockup A draws them. */}
              <div role="group" aria-label="Table" className="flex flex-wrap gap-1.5">
                {GROUPS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    aria-pressed={group === g.key}
                    onClick={() => setGroup(g.key)}
                    className={cn(
                      'h-11 rounded-full border px-4 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                      group === g.key ? 'border-year-header bg-year-header text-year-header-ink' : 'bg-card hover:bg-accent',
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-5">
                <YearTable sheet={sheet} group={group} thisMonth={thisMonth} />
                <AnnualCharts sheet={sheet} wide={false} />
              </div>
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
  // Mockup A's two select pills: the native picker, a wheel on a phone,
  // 44px tall with the chevron the app's selects draw. A field is as wide
  // as its box, so each box is as wide as its longest choice.
  return (
    <div className="flex flex-wrap items-center gap-2.5 md:text-base">
      <span className="font-medium">Starts in</span>
      <div className="w-max">
        <NativeSelect
          aria-label="Start month"
          className="font-medium"
          value={month}
          onChange={(e) => navigate('year', `${year}-${e.target.value}`)}
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={String(i + 1).padStart(2, '0')}>
              {name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="w-max">
        <NativeSelect
          aria-label="Start year"
          className="font-medium"
          value={year}
          onChange={(e) => navigate('year', `${e.target.value}-${month}`)}
        >
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </NativeSelect>
      </div>
    </div>
  )
}

type GroupKey = keyof YearGroups
type Tone = 'income' | 'savings' | 'bills' | 'debts' | 'subscriptions' | 'variable' | 'expenses'

/**
 * Annual's seven cards: Income, Expenses and Savings across the top (H3:X21)
 * and Bills, Debts, Subscriptions and Variable expenses below (B25:X41),
 * each in its list's hue (ADR 0010). Expenses are the four added (P10, Q10),
 * so they are no one list and take the neutral grey, never Debts' rose.
 */
const GROUPS: readonly { key: GroupKey; label: string; heading: string; budget: 'Goal' | 'Budgeted'; tone: Tone }[] = [
  { key: 'income', label: 'Income', heading: 'Income', budget: 'Goal', tone: 'income' },
  { key: 'expenses', label: 'Expenses', heading: 'Expenses', budget: 'Budgeted', tone: 'expenses' },
  { key: 'savings', label: 'Savings', heading: 'Savings', budget: 'Goal', tone: 'savings' },
  { key: 'bill', label: 'Bills', heading: 'Bills', budget: 'Budgeted', tone: 'bills' },
  { key: 'debt', label: 'Debts', heading: 'Debts', budget: 'Budgeted', tone: 'debts' },
  { key: 'subscription', label: 'Subscriptions', heading: 'Subscriptions', budget: 'Budgeted', tone: 'subscriptions' },
  { key: 'variable', label: 'Variable', heading: 'Variable expenses', budget: 'Budgeted', tone: 'variable' },
]

/**
 * Each table's dot (no words), its head tinted in the list's colour with the
 * list's ink, and its Total row on that tint in the ink. Written out for Tailwind.
 */
const TONE: Record<Tone, { dot: string; header: string; ink: string }> = {
  income: { dot: 'bg-income-accent', header: 'bg-income-header', ink: 'text-income-ink' },
  savings: { dot: 'bg-savings-accent', header: 'bg-savings-header', ink: 'text-savings-ink' },
  bills: { dot: 'bg-bills-accent', header: 'bg-bills-header', ink: 'text-bills-ink' },
  debts: { dot: 'bg-debts-accent', header: 'bg-debts-header', ink: 'text-debts-ink' },
  subscriptions: { dot: 'bg-subscriptions-accent', header: 'bg-subscriptions-header', ink: 'text-subscriptions-ink' },
  variable: { dot: 'bg-variable-accent', header: 'bg-variable-header', ink: 'text-variable-ink' },
  expenses: { dot: 'bg-owed-accent', header: 'bg-owed-header', ink: 'text-owed-ink' },
}

/**
 * One card: its dot, heading and Actual total on the card head, then a row a month.
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
  // Four across, the table keeps 10px at the card's edges (12px from 1400px)
  // and 4px each side of a cell within, and the type is 12px until 1400px,
  // so no month or figure wraps. One table alone has 16px at its edges (20px
  // from 768px, as Mockup A draws it), 8px each side within, 4px below 360px
  // so the table stays inside its card, and 14px type, 15px from 768px.
  const left = compact ? 'pl-2.5 min-[1400px]:pl-3' : 'pl-4 md:pl-5'
  const right = compact ? 'pr-2.5 min-[1400px]:pr-3' : 'pr-4 md:pr-5'
  const [inL, inR] = compact ? ['pl-1', 'pr-1'] : ['pl-1 min-[360px]:pl-2', 'pr-1 min-[360px]:pr-2']
  // One class a side: cn() is a plain join, and a px-* under a breakpoint
  // outranks a pl-* without one, which pulled the table in from its edges.
  const sides = [cn(left, inR), cn(inL, inR), cn(inL, right)] as const
  return (
    <section aria-label={`${g.heading} by month`} className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-4', left, right)}>
        <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-[4px]', tone.dot)} />
        <h2 className={cn('flex-1 font-semibold', compact ? 'text-base' : 'text-lg')}>{g.heading}</h2>
        {/* Drops under the name before it would break inside the number. */}
        <Figure className={cn('shrink-0 font-bold', compact ? 'text-base' : 'text-lg')}>{formatCents(total.actualCents)}</Figure>
      </div>
      <table className={cn('w-full', compact ? 'text-xs whitespace-nowrap min-[1400px]:text-[0.8125rem]' : 'text-sm md:text-[0.9375rem]')}>
        <thead className={cn(tone.header, tone.ink)}>
          <tr>
            {['Month', g.budget, 'Actual'].map((name, i) => (
              <th
                key={name}
                scope="col"
                className={cn(sides[i], 'py-2.5 font-medium', i === 0 ? 'text-left' : 'text-right')}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.months.map((m) => {
            const now = m.month === thisMonth
            return (
              <tr
                key={m.month}
                aria-current={now ? 'date' : undefined}
                className={cn('border-t', now && 'bg-year-today font-semibold')}
              >
                <th scope="row" className={cn('py-2.5 text-left', sides[0], now ? 'font-semibold' : 'font-normal')}>
                  {compact ? formatShortMonth(m.month) : formatMonthTitle(m.month)}
                </th>
                <td className={cn('tnum py-2.5 text-right font-normal text-muted-foreground', sides[1])}>{blank(m[group].budgetCents)}</td>
                <td className={cn('tnum py-2.5 text-right', sides[2], m[group].actualCents < 0 && 'text-spend')}>
                  {blank(m[group].actualCents)}
                </td>
              </tr>
            )
          })}
          <tr className={cn('border-t font-semibold', tone.header)}>
            <th scope="row" className={cn('py-3 text-left', sides[0])}>
              Total
            </th>
            <td className={cn('tnum py-3 text-right', sides[1])}>{formatAmount(total.budgetCents)}</td>
            <td className={cn('tnum py-3 text-right', sides[2])}>{formatAmount(total.actualCents)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

/**
 * Annual's left panel (A6:F21): the start and current month, then the
 * year's totals, Left over (F12, decision 15) and the balances (D18, D20),
 * as Mockup A's white card. Until the start month's balance is typed, it
 * says where to type it.
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
    <section aria-label="Year totals" className="min-w-0 rounded-xl border bg-card px-5 py-4">
      <dl className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
            <dd className="tnum text-lg font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      {/* As the phone's balances card says: where the missing start is typed (D17). */}
      {sheet.startingBalanceCents === null ? (
        <button
          type="button"
          className={cn('mt-3 text-left text-xs text-muted-foreground underline underline-offset-4', LINE_BUTTON)}
          onClick={() => navigate('month', sheet.startMonth.slice(0, 7))}
        >
          Type {formatMonthName(sheet.startMonth)}&rsquo;s starting balance on the Month to see these
        </button>
      ) : null}
    </section>
  )
}
