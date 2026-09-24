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
import { formatDateRange, todayIso } from '../format.js'
import { Card, CardContent } from '../components/ui/card.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'
import { WeekBlocks } from './WeekBlocks.js'
import { PeriodSwitch } from './PeriodSwitch.js'
import { GoalCard, NoGoal } from './WeekGoal.js'
import { HelpButton } from '../help/HelpButton.js'

/**
 * The workbook's Weekly Budget: the Month's summary and six blocks over the
 * Monday-to-Sunday week (D14), with the flight goal beside them.
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
  const { supabase, categories, goal, pendingTotal, loadError, version } = useAppData()
  const today = isoDate(todayIso())
  // This week counts its days left from today, not its Monday.
  const asOf = monday === null || monday === weekBounds(today).start ? today : isoDate(monday)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A weekly budget refused after its editor closed, kept until another opens.
  const [unsaved, setUnsaved] = useState<string | null>(null)
  const bounds = useMemo(() => weekBounds(asOf), [asOf])

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
      return 'A charge or a monthly amount this week names a category that did not load, so the week is not shown. Reload to try again.'
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
      <header className="-mx-4 flex flex-wrap items-center justify-between gap-2 bg-title-band px-4 py-4 md:mx-0 md:rounded-xl">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{isThisWeek ? 'This week' : 'Week of'}</h1>
            <HelpButton screen="week" />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDateRange(bounds.start, bounds.end)}
            {isThisWeek && sheet !== null ? ` · ${sheet.daysLeft} ${sheet.daysLeft === 1 ? 'day' : 'days'} left` : ''}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => step(-1)}>
            <Icon name="chevronLeft" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next week" disabled={isThisWeek} onClick={() => step(1)}>
            <Icon name="chevronRight" />
          </Button>
        </div>
      </header>

      {pendingTotal > 0 ? (
        <button
          type="button"
          onClick={() => navigate('review')}
          className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent"
        >
          <span className="rounded-full bg-warning/15 p-2 text-warning">
            <Icon name="inbox" className="size-4" />
          </span>
          <span className="flex-1 text-sm">
            <span className="font-medium">{pendingTotal} waiting for review.</span>{' '}
            <span className="text-muted-foreground">They are not counted below until you approve them.</span>
          </span>
          <Icon name="chevronRight" className="size-4 text-muted-foreground" />
        </button>
      ) : null}

      {error !== null ? <Alert tone="error" title="Could not load this week">{error}</Alert> : null}
      {unsaved !== null ? <Alert tone="error" title="A weekly budget or goal was not saved">{unsaved}</Alert> : null}
      {typeof week === 'string' ? <Alert tone="error" title="Could not show this week">{week}</Alert> : null}
      {/* A first load that failed is said above the screen, by App, as on the Month. */}
      {week === null && error === null && (version > 0 || loadError === null) ? <SkeletonCard /> : null}

      {sheet !== null ? (
        <WeekBlocks
          sheet={sheet}
          comparison={comparison}
          aside={goal !== null ? <GoalCard weekSpentCents={sheet.summary.spentCents} asOf={asOf} /> : <NoGoal />}
          onUnsaved={setUnsaved}
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
    <Card role="status" aria-label="Loading this week" aria-busy="true" className="animate-pulse">
      <CardContent className="space-y-3 pt-5">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-9 w-40 rounded bg-muted" />
        <div className="h-2 w-full rounded bg-muted" />
      </CardContent>
    </Card>
  )
}
