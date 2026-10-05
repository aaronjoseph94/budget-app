import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  isoDate,
  monthBounds,
  paycheckSheet,
  payPeriod,
  periodComparison,
  shiftPayPeriod,
  type PaycheckSheet,
  type PayPeriod,
  type PaySchedule,
  type PeriodComparison,
} from '@budget/core'
import { useAppData } from '../app-data.js'
import { latestStatementEnd, listBudgetHistory, listPlanHistory, listTransactions } from '../ledger.js'
import type { BudgetRow, Category, LedgerRow, PayScheduleRow, PlanRow } from '../ledger.js'
import { budgetsForCore, categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import { formatDateRange, formatMonthTitle } from '../format.js'
import { navigate } from '../nav.js'
import { Alert, Loading } from '../components/ui/feedback.js'
import { Icon } from '../components/ui/icons.js'
import { MonthTitle } from '../components/ui/type.js'
import { PeriodSummary } from './WeekBlocks.js'
import { useEarlier } from '../earlier.js'
import { ImportedThrough, PeriodBlocks, StepButton, TransfersNote } from './MonthScreen.js'
import { NOT_SPENDING, OpenedCharges } from './MonthCharges.js'
import { FREQUENCY_WORD } from './SetupPay.js'
import { HelpButton } from '../help/HelpButton.js'
import { TryAgain } from '../try-again.js'

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
  const { supabase, categories, version, today: day0 } = useAppData()
  const { first_pay_date: first, frequency } = row
  const schedule = useMemo((): PaySchedule => ({ firstPayDate: isoDate(first), frequency }), [first, frequency])
  const today = isoDate(day0)
  const { start, end } = payPeriod({ schedule, asOf: day === null ? today : isoDate(day) })
  const month = monthBounds(start).start
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The category whose charges are open, by id; another period closes it (N48).
  const [opened, setOpened] = useState<string | null>(null)
  useEffect(() => setOpened(null), [start])
  const step = (periods: number) => navigate('paycheck', shiftPayPeriod({ schedule, asOf: start, periods }).start)

  useEffect(() => {
    if (version === 0) return
    let live = true
    setError(null)
    Promise.all([
      listTransactions(supabase, { from: start, to: end }),
      listBudgetHistory(supabase, month, 'paycheck'),
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
      return 'A charge, a budget or a monthly amount in this pay period names a category that did not load, so it is not shown.'
    }
  }, [here, categories, start, schedule])

  // The period before, by the same number of days while this one runs (F25,
  // D26). Read on its own, so if it fails only the comparison goes.
  const previous: PayPeriod = shiftPayPeriod({ schedule, asOf: start, periods: -1 })
  const earlier = useEarlier({ from: previous.start, to: previous.end })
  const comparison = useMemo((): PeriodComparison | 'failed' | null => {
    if (here === null || earlier === null) return null
    if (earlier === 'failed') return 'failed'
    try {
      return periodComparison({
        period: 'pay',
        schedule,
        day: start,
        asOf: today,
        historyStart: earlier.historyStart === null ? null : isoDate(earlier.historyStart),
        categories: categoriesForCore(categories),
        planHistory: plansForCore(here.plans),
        entries: entriesForCore([...here.rows, ...earlier.rows]),
      })
    } catch {
      // As the period's own sheet: a row naming a category that did not load.
      return 'failed'
    }
  }, [here, earlier, categories, start, schedule, today])

  return (
    <>
      {/* Mockup A's title row, as the Month's and the Week's. */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            <MonthTitle>{payPeriod({ schedule, asOf: today }).start === start ? 'This pay period' : 'Pay period'}</MonthTitle>
            <HelpButton screen="paycheck" className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground md:text-base">
            {/* With its year when not this year's, here where it can wrap (e2e-plan-08). */}
            {formatDateRange(start, end, today)} · {source.name}, paid {FREQUENCY_WORD[schedule.frequency].toLowerCase()}
          </p>
        </div>
        <div className="flex items-stretch rounded-md border bg-card">
          <StepButton label="Previous pay period" icon="chevronLeft" onClick={() => step(-1)} />
          <span className="flex items-center gap-2 border-x px-3.5 text-[0.9375rem] font-medium whitespace-nowrap">
            <Icon name="calendar" className="size-4 text-muted-foreground" />
            <span className="tnum">{formatDateRange(start, end)}</span>
          </span>
          <StepButton label="Next pay period" icon="chevronRight" onClick={() => step(1)} />
        </div>
      </header>

      {error !== null ? <Alert tone="error" title="Could not load this pay period">{error}</Alert> : null}
      {typeof sheet === 'string' ? <Alert tone="error" title="Could not show this pay period">{sheet} <TryAgain />.</Alert> : null}
      {sheet === null && error === null ? <Loading what="this pay period" /> : null}

      {sheet !== null && typeof sheet !== 'string' ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <PeriodSummary
              sheet={sheet}
              comparison={comparison}
              compareLabel="Compared with the last pay period"
              earlier="the last pay period"
              noBudgetsHint="No budgets on Variable expenses yet. They are typed on the Month."
            />
            {/* Where the workbook's chart well stands (I3:M18): the owner was told a
              share is about $738 of $1,600 rent, and this says how it is found.
              Mockup A's wide card tinted to the accent, its muted words in
              canvas-muted (ADR 0010). */}
            <section
              aria-labelledby="pay-counted"
              className="min-w-0 space-y-3 rounded-xl border bg-linear-to-b from-card to-primary-tint p-4 text-[0.9375rem] md:px-6 md:py-[1.375rem]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="pay-counted" className="text-lg font-semibold leading-snug">
                  How this period is counted
                </h2>
                {chooser}
              </div>
              <p>
                Bills with no charge yet in this period, and budgets and goals, are {formatMonthTitle(sheet.month)}’s.{' '}
                {SHARE[schedule.frequency]} Charges count as they are.
              </p>
              <p className="text-canvas-muted">Budgets and goals are typed on the Month.</p>
            </section>
          </div>
          <ImportedThrough through={sheet.importedThrough} />
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:gap-5">
            <PeriodBlocks blocks={sheet.blocks} period="this pay period" onOpen={setOpened} />
          </div>
          <TransfersNote cents={sheet.transfersCents} onOpen={() => setOpened(NOT_SPENDING)} />
          {here !== null && opened !== null ? (
            <OpenedCharges
              blocks={sheet.blocks}
              transfersCents={sheet.transfersCents}
              rows={here.rows}
              categoryId={opened}
              month={month}
              period={{
                title: formatDateRange(start, end),
                inWords: formatDateRange(start, end),
                before: 'Last pay period',
                // Paid more often than monthly, a planned figure is the period's share (e2e-plan-07).
                ...(schedule.frequency === 'monthly' ? {} : { planned: 'its share of the monthly amount from Setup' }),
              }}
              compared={comparison !== null && comparison !== 'failed' && comparison.status === 'compared' ? comparison : null}
              onClose={() => setOpened(null)}
            />
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
