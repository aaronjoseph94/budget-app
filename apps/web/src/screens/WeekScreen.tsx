import { useEffect, useMemo, useState } from 'react'
import { isoDate, monthBounds, shiftWeek, weekBounds, weekSheet, type WeekSheet } from '@budget/core'
import { useAppData } from '../app-data.js'
import { latestStatementEnd, listPlanHistory, listTransactions, type LedgerRow, type PlanRow } from '../ledger.js'
import { entriesForCore, plansForCore, weekCategoriesForCore } from '../sheet-input.js'
import { formatDateRange, todayIso } from '../format.js'
import { Card, CardContent } from '../components/ui/card.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'
import { WeekBlocks } from './WeekBlocks.js'
import { GoalCard, NoGoal } from './WeekGoal.js'

/**
 * Workbook's Weekly Budget: the Month's summary and six blocks over the
 * Monday-to-Sunday week (D14), with the flight goal beside them.
 *
 * Every figure comes from packages/core: weekSheet over the week's ledger,
 * the monthly amounts typed up to its last month and each category's weekly
 * budget; goalProgress and timeEquivalent for the goal. This screen formats
 * them. Nothing unreviewed is in it.
 */
export function WeekScreen() {
  const { supabase, categories, goal, pendingTotal, loadError, version } = useAppData()
  const today = isoDate(todayIso())
  const [asOf, setAsOf] = useState(today)
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

  const isThisWeek = weekBounds(today).start === bounds.start
  // Back on this week, its days left count from today again, not its Monday.
  const step = (weeks: number) => {
    const next = shiftWeek(bounds.start, weeks)
    setAsOf(weekBounds(next).start === weekBounds(today).start ? today : next)
  }

  return (
    <div className="space-y-4">
      <header className="-mx-4 flex items-center justify-between gap-2 bg-title-band px-4 py-4 md:mx-0 md:rounded-xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{isThisWeek ? 'This week' : 'Week of'}</h1>
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

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <CardContent className="space-y-3 pt-5">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-9 w-40 rounded bg-muted" />
        <div className="h-2 w-full rounded bg-muted" />
      </CardContent>
    </Card>
  )
}
