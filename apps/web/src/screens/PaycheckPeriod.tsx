import { useEffect, useMemo, useState } from 'react'
import { isoDate, monthBounds, paycheckSheet, payPeriod, shiftPayPeriod, type PaycheckSheet, type PaySchedule } from '@budget/core'
import { useAppData } from '../app-data.js'
import { latestStatementEnd, listBudgetHistory, listPlanHistory, listTransactions } from '../ledger.js'
import type { BudgetRow, Category, LedgerRow, PayScheduleRow, PlanRow } from '../ledger.js'
import { budgetsForCore, categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import { formatCents, formatDateRange, formatIsoDate, formatMagnitude, todayIso } from '../format.js'
import { navigate } from '../nav.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { Block } from './MonthScreen.js'
import { FREQUENCY_WORD } from './SetupPay.js'

/**
 * One pay period of Workbook's Paycheck Budget (S15b): the Month's blocks over
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
}: {
  day: string | null
  /** The income source whose schedule this is. */
  source: Category
  row: PayScheduleRow
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
      <header className="-mx-4 flex items-center justify-between gap-2 bg-paycheck-band px-4 py-4 text-paycheck-ink md:mx-0 md:rounded-xl">
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
          <p className="text-sm text-muted-foreground">
            {sheet.importedThrough === null
              ? 'No statement imported yet.'
              : `Statement imported up to ${formatIsoDate(sheet.importedThrough)}`}
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Summary sheet={sheet} />
            <Block kind="variable" block={sheet.blocks.variable} className="order-1 xl:order-7" />
            <Block kind="bill" block={sheet.blocks.bill} className="order-2 xl:order-4" />
            <Block kind="subscription" block={sheet.blocks.subscription} className="order-3 xl:order-6" />
            <Block kind="debt" block={sheet.blocks.debt} className="order-4 xl:order-5" />
            <Block kind="income" block={sheet.blocks.income} className="order-5 xl:order-2" />
            <Block kind="savings" block={sheet.blocks.savings} className="order-6 xl:order-3" />
          </div>
          {/* Left out of every block and total above, so said out loud (D9). */}
          {sheet.transfersCents !== 0 ? (
            <p className="text-sm text-muted-foreground">
              {sheet.transfersCents > 0 ? 'Paid to your card: ' : 'Moved out, not spending: '}
              <span className="tnum">{formatMagnitude(sheet.transfersCents)}</span> — not counted.
              {sheet.transfersCents > 0 ? ' What it paid for is already in the blocks above.' : ''}
            </p>
          ) : null}
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
        </div>
      </dl>
    </section>
  )
}
