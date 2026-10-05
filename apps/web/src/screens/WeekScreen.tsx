import { useEffect, useMemo, useState } from 'react'
import {
  isoDate,
  monthBounds,
  periodComparison,
  shiftWeek,
  weekBounds,
  weekSheet,
  type PeriodComparison,
  type WeekSheet,
} from '@budget/core'
import { useAppData } from '../app-data.js'
import { latestStatementEnd, listPlanHistory, listTransactions, type LedgerRow, type PlanRow } from '../ledger.js'
import { categoriesForCore, entriesForCore, plansForCore, weekCategoriesForCore } from '../sheet-input.js'
import { useEarlier } from '../earlier.js'
import { formatDateRange } from '../format.js'
import { OpenedCharges } from './MonthCharges.js'
import { StepButton, WaitingBanner } from './MonthScreen.js'
import { MonthTitle } from '../components/ui/type.js'
import { Card, CardContent } from '../components/ui/card.js'
import { Alert } from '../components/ui/feedback.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'
import { WeekBlocks } from './WeekBlocks.js'
import { PeriodSwitch } from './PeriodSwitch.js'
import { GoalCard, NoGoal } from './WeekGoal.js'
import { HelpButton } from '../help/HelpButton.js'
import { TryAgain } from '../try-again.js'

/**
 * The workbook's Weekly Budget: the Month's summary and six blocks over the
 * Monday-to-Sunday week (D14), with the main goal beside them (F45).
 *
 * Every figure comes from packages/core: weekSheet over the week's ledger,
 * the monthly amounts typed up to its last month and each category's weekly
 * budget; goalProgress and timeEquivalent for the goal. This screen formats
 * them. Nothing unreviewed is in it.
 *
 * `monday` is the week the address names (`#/week/2026-09-21`, ADR 0006),
 * or null for this week. The arrows write the week they land on into the
 * address, as the Month's do, so a refresh or the back gesture returns to it.
 */
export function WeekScreen({ monday }: { monday: string | null }) {
  const { supabase, categories, mainGoal, pendingTotal, loadError, version, today: day } = useAppData()
  const today = isoDate(day)
  // This week counts its days left from today, not its Monday.
  const asOf = monday === null || monday === weekBounds(today).start ? today : isoDate(monday)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A weekly budget refused after its editor closed, kept until another opens.
  const [unsaved, setUnsaved] = useState<string | null>(null)
  const bounds = useMemo(() => weekBounds(asOf), [asOf])
  // The category whose charges are open, by id; another week closes it.
  const [opened, setOpened] = useState<string | null>(null)
  useEffect(() => setOpened(null), [bounds.start])

  useEffect(() => {
    // As on the Month: rows read before the first load brings the categories
    // name categories core has not been given, and it refuses them (N35).
    if (version === 0) return
    let live = true
    setError(null)
    Promise.all([
      listTransactions(supabase, { from: bounds.start, to: bounds.end }),
      // Up to the week's last month: a week across a month end pays each
      // month's amount on its own due day (D13).
      listPlanHistory(supabase, monthBounds(bounds.end).start, 'week'),
      latestStatementEnd(supabase),
    ])
      .then(([rows, plans, ends]) => live && setLoaded({ start: bounds.start, rows, plans, ends }))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load this week.'))
    return () => {
      live = false
    }
  }, [supabase, bounds.start, bounds.end, version])

  // A week's rows only ever fill that week: while the next one loads, the
  // screen waits rather than count the last one's, none of which fall in it,
  // and show an empty week under its dates.
  const here = loaded !== null && loaded.start === bounds.start ? loaded : null
  const week = useMemo((): WeekSheet | string | null => {
    if (here === null) return null
    try {
      return weekSheet({
        asOf,
        categories: weekCategoriesForCore(categories),
        planHistory: plansForCore(here.plans),
        entries: entriesForCore(here.rows),
        statementPeriodEnds: here.ends.map((e) => isoDate(e)),
        // Nothing types a balance for a week, so there is no start, and no end (D17).
        startingBalanceCents: null,
      })
    } catch {
      // As on the Month: core refuses a row it cannot file rather than
      // leave it out of every total. Said plainly, never as its message.
      return 'A charge or a monthly amount this week names a category that did not load, so the week is not shown.'
    }
  }, [here, categories, asOf])
  const sheet = typeof week === 'string' ? null : week

  // Last week, to the same weekday while this one runs (F25, D26). Read on
  // its own, so if it fails only the comparison goes.
  const earlier = useEarlier({ from: shiftWeek(bounds.start, -1), to: shiftWeek(bounds.end, -1) })
  const comparison = useMemo((): PeriodComparison | 'failed' | null => {
    if (here === null || earlier === null) return null
    if (earlier === 'failed') return 'failed'
    try {
      return periodComparison({
        period: 'week',
        week: bounds.start,
        asOf: today,
        historyStart: earlier.historyStart === null ? null : isoDate(earlier.historyStart),
        categories: categoriesForCore(categories),
        planHistory: plansForCore(here.plans),
        entries: entriesForCore([...here.rows, ...earlier.rows]),
      })
    } catch {
      // As the week's own sheet: a row naming a category that did not load.
      return 'failed'
    }
  }, [here, earlier, categories, bounds.start, today])

  const isThisWeek = weekBounds(today).start === bounds.start
  // Back on this week, the address is the bare #/week again, so it keeps
  // meaning "this week" when it is reopened next week.
  const step = (weeks: number) => {
    const next = shiftWeek(bounds.start, weeks)
    navigate('week', next === weekBounds(today).start ? null : next)
  }

  return (
    <div className="space-y-4">
      <PeriodSwitch current="week" />
      {/* Mockup A's title row, as the Month's: the title with its ?, the
        dates under it, and on the right the week stepper with its dates.
        It wraps, so at 320px the stepper drops under the title. */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            <MonthTitle>{isThisWeek ? 'This week' : 'Week of'}</MonthTitle>
            <HelpButton screen="week" className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground md:text-base">
            {/* With its year when not this year's, here where it can wrap (e2e-plan-08). */}
            {formatDateRange(bounds.start, bounds.end, today)}
            {isThisWeek && sheet !== null ? ` · ${sheet.daysLeft} ${sheet.daysLeft === 1 ? 'day' : 'days'} left` : ''}
          </p>
        </div>
        <div className="flex items-stretch rounded-md border bg-card">
          <StepButton label="Previous week" icon="chevronLeft" onClick={() => step(-1)} />
          <span className="flex items-center gap-2 border-x px-3.5 text-[0.9375rem] font-medium whitespace-nowrap">
            <Icon name="calendar" className="size-4 text-muted-foreground" />
            <span className="tnum">{formatDateRange(bounds.start, bounds.end)}</span>
          </span>
          <StepButton label="Next week" icon="chevronRight" disabled={isThisWeek} onClick={() => step(1)} />
        </div>
      </header>

      {pendingTotal > 0 ? (
        <WaitingBanner>
          <span className="font-semibold">{pendingTotal} waiting for review.</span> They are not counted below until you approve them.
        </WaitingBanner>
      ) : null}

      {error !== null ? <Alert tone="error" title="Could not load this week">{error}</Alert> : null}
      {unsaved !== null ? <Alert tone="error" title="A weekly budget or goal was not saved">{unsaved}</Alert> : null}
      {typeof week === 'string' ? <Alert tone="error" title="Could not show this week">{week} <TryAgain />.</Alert> : null}
      {/* A first load that failed is said above the screen, by App, as on the Month. */}
      {week === null && error === null && (version > 0 || loadError === null) ? <SkeletonCard /> : null}

      {sheet !== null ? (
        <WeekBlocks
          sheet={sheet}
          comparison={comparison}
          aside={mainGoal !== null ? <GoalCard weekSpentCents={sheet.summary.spentCents} asOf={asOf} /> : <NoGoal />}
          onUnsaved={setUnsaved}
          onOpen={setOpened}
        />
      ) : null}
      {sheet !== null && here !== null && opened !== null ? (
        <OpenedCharges
          blocks={sheet.blocks}
          transfersCents={sheet.transfersCents}
          rows={here.rows}
          categoryId={opened}
          month={monthBounds(bounds.start).start}
          period={{ title: formatDateRange(bounds.start, bounds.end), inWords: formatDateRange(bounds.start, bounds.end), before: 'Last week' }}
          compared={comparison !== null && comparison !== 'failed' && comparison.status === 'compared' ? comparison : null}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </div>
  )
}

interface Loaded {
  readonly start: string
  readonly rows: readonly LedgerRow[]
  /** Every monthly amount typed from the week's last month or before it. */
  readonly plans: readonly PlanRow[]
  readonly ends: readonly string[]
}

/** A busy status, so a screen reader is told the week is loading, as the eye is (CR-10). */
function SkeletonCard() {
  return (
    <Card role="status" aria-label="Loading this week" aria-busy="true" className="animate-pulse motion-reduce:animate-none">
      <CardContent className="space-y-3 pt-5">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-9 w-40 rounded bg-muted" />
        <div className="h-2 w-full rounded bg-muted" />
      </CardContent>
    </Card>
  )
}
