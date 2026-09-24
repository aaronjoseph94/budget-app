import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { isoDate, monthBounds, paycheckSheet, payPeriod, shiftPayPeriod, type PaycheckSheet, type PaySchedule } from '@budget/core'
import { useAppData } from '../app-data.js'
import { latestStatementEnd, listBudgetHistory, listPlanHistory, listTransactions } from '../ledger.js'
import type { BudgetRow, Category, LedgerRow, PayScheduleRow, PlanRow } from '../ledger.js'
import { budgetsForCore, categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import { formatCents, formatDateRange, formatMonthTitle, todayIso } from '../format.js'
import { navigate } from '../nav.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { ImportedThrough, PeriodBlocks, TransfersNote } from './MonthScreen.js'
import { FREQUENCY_WORD } from './SetupPay.js'

/** In words, how a monthly amount is shared across this pay (F15). */
const SHARE: Readonly<Record<PaySchedule['frequency'], string>> = {
  weekly: 'You are paid weekly, so each shows 12 months over 52 paydays: a week’s share.',
  biweekly: 'You are paid every two weeks, so each shows 12 months over 26 paydays: two weeks’ share.',
  monthly: 'You are paid monthly, so each shows its whole monthly amount.',
}

/**
 * One pay period of the workbook's Paycheck Budget (S15b): the Month's blocks over
 * the period holding `day`, found from an income source's pay schedule
 * rather than typed (F15 B, D18), or today's period when `day` is null. The
 * arrows write the payday they land on into the address.
 *
 * Every number is paycheckSheet's, from packages/core: the period's ledger
 * rows as they are, and the payday's month's monthly amounts and budgets,
 * each as its share of a pay period. This screen formats them.
 */
export function PaycheckPeriod({
  day,
  source,
  row,
  chooser,
}: {
  day: string | null
  /** The income source whose schedule this is. */
  source: Category
  row: PayScheduleRow
  /** Which source drives the period, when there is a choice; shown above how it is counted. */
  chooser?: ReactNode
}) {
  const { supabase, categories, version } = useAppData()
  const { first_pay_date: first, frequency } = row
  const schedule = useMemo((): PaySchedule => ({ firstPayDate: isoDate(first), frequency }), [first, frequency])
  const today = isoDate(todayIso())
  const { start, end } = payPeriod({ schedule, asOf: day === null ? today : isoDate(day) })
  const month = monthBounds(start).start
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const step = (periods: number) => navigate('paycheck', shiftPayPeriod({ schedule, asOf: start, periods }).start)

  useEffect(() => {
    if (version === 0) return
    let live = true
    setError(null)
    Promise.all([
      listTransactions(supabase, { from: start, to: end }),
      listBudgetHistory(supabase, month),
      listPlanHistory(supabase, month, 'paycheck'),
      latestStatementEnd(supabase),
    ])
      .then(([rows, budgets, plans, ends]) => live && setLoaded({ key: `${start} ${end}`, rows, budgets, plans, ends }))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load this pay period.'))
    return () => {
      live = false
    }
  }, [supabase, start, end, month, version])

  // A period's rows only ever fill that period: while another loads, the
  // screen waits rather than count the last one's under these dates.
  const here = loaded !== null && loaded.key === `${start} ${end}` ? loaded : null
  const sheet = useMemo((): PaycheckSheet | string | null => {
    if (here === null) return null
    try {
      return paycheckSheet({
        asOf: start,
        schedule,
        categories: categoriesForCore(categories),
        budgetHistory: budgetsForCore(here.budgets),
        planHistory: plansForCore(here.plans),
        entries: entriesForCore(here.rows),
        statementPeriodEnds: here.ends.map((e) => isoDate(e)),
        // Nothing types a balance for a pay period, so there is no start, and no end (D17, N45).
        startingBalanceCents: null,
      })
    } catch {
      return 'A charge, a budget or a monthly amount in this pay period names a category that did not load, so it is not shown. Reload to try again.'
    }
  }, [here, categories, start, schedule])

  return (
    <>
      <header className="-mx-4 flex flex-wrap items-center justify-between gap-2 bg-paycheck-band px-4 py-4 text-paycheck-ink md:mx-0 md:rounded-xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {payPeriod({ schedule, asOf: today }).start === start ? 'This pay period' : 'Pay period'}
          </h1>
          <p className="text-sm">
            {formatDateRange(start, end)} · {source.name}, paid {FREQUENCY_WORD[schedule.frequency].toLowerCase()}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous pay period" onClick={() => step(-1)}>
            <Icon name="chevronLeft" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next pay period" onClick={() => step(1)}>
            <Icon name="chevronRight" />
          </Button>
        </div>
      </header>

      {error !== null ? <Alert tone="error" title="Could not load this pay period">{error}</Alert> : null}
      {typeof sheet === 'string' ? <Alert tone="error" title="Could not show this pay period">{sheet}</Alert> : null}
      {sheet === null && error === null ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : null}

      {sheet !== null && typeof sheet !== 'string' ? (
        <>
          <ImportedThrough through={sheet.importedThrough} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Summary sheet={sheet} />
            {/* Where the workbook's chart well stands (I3:M18): the owner was told a
              share is about $738 of $1,600 rent, and this says how it is found. */}
            <section
              aria-label="How this period is counted"
              className="order-7 space-y-3 rounded-xl border bg-card p-4 text-sm shadow-sm md:col-span-2 xl:order-1 xl:col-span-1"
            >
              {chooser}
              <p>
                Bills with no charge yet in this period, and budgets and goals, are {formatMonthTitle(sheet.month)}’s.{' '}
                {SHARE[schedule.frequency]} Charges count as they are.
              </p>
              <p className="text-muted-foreground">Budgets and goals are typed on the Month.</p>
            </section>
            <PeriodBlocks blocks={sheet.blocks} />
          </div>
          <TransfersNote cents={sheet.transfersCents} />
        </>
      ) : null}
    </>
  )
}

interface Loaded {
  /** The period's first and last day: another source's period can share a payday. */
  readonly key: string
  readonly rows: readonly LedgerRow[]
  readonly budgets: readonly BudgetRow[]
  readonly plans: readonly PlanRow[]
  readonly ends: readonly string[]
}

/**
 * Paycheck Budget's lavender summary panel (D9:D15): Money Spent and Left to
 * Spend, both core's. Its Starting and Ending Balance are not shown, as on
 * the Week: no balance is typed for a period (D17, N45).
 */
function Summary({ sheet }: { sheet: PaycheckSheet }) {
  const { spentCents, leftToSpendCents: left } = sheet.summary
  const noBudgets = sheet.blocks.variable.rows.every((r) => r.budgetCents === null)
  return (
    <section aria-label="Summary" className="order-0 rounded-xl border bg-paycheck-band p-4 text-paycheck-ink shadow-sm xl:order-0">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-1">
        <div>
          <dt className="text-xs font-medium">Spent</dt>
          <dd className="text-2xl font-bold">
            <Figure>{formatCents(spentCents)}</Figure>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium">Left to spend</dt>
          <dd className="text-2xl font-bold">
            <Figure className={cn(left < 0 && '-mx-1.5 rounded-lg bg-summary-negative px-1.5 text-summary-negative-ink')}>
              {formatCents(left)}
            </Figure>
          </dd>
          {/* As the Month and Week say it (F5), and where a budget is typed,
            since this view shows budgets and takes none. */}
          {noBudgets ? <dd className="mt-0.5 text-xs">No budgets on Variable expenses yet. They are typed on the Month.</dd> : null}
        </div>
      </dl>
    </section>
  )
}
