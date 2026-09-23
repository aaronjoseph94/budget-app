import { useEffect, useMemo, useState } from 'react'
import { isoDate, shiftWeek, weekBounds, weeklySummary } from '@budget/core'
import { useAppData } from '../app-data.js'
import { listTransactions, type LedgerRow } from '../ledger.js'
import { formatBasisPoints, formatCents, formatDateRange, formatMagnitude, todayIso } from '../format.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js'
import { Alert, Empty, Progress } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { Figure } from '../components/ui/type.js'
import { navigate } from '../nav.js'
import { GoalCard, NoGoal } from './WeekGoal.js'

/**
 * "How am I doing this week" — the roadmap's Phase 2 question.
 *
 * Every figure comes from packages/core: weeklySummary for the budget,
 * goalProgress and timeEquivalent for the goal. This screen formats them.
 */
export function WeekScreen() {
  const { supabase, categories, goal, pendingTotal, version } = useAppData()
  const today = isoDate(todayIso())
  const [asOf, setAsOf] = useState(today)
  const [rows, setRows] = useState<readonly LedgerRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bounds = useMemo(() => weekBounds(asOf), [asOf])

  useEffect(() => {
    let live = true
    listTransactions(supabase, { from: bounds.start, to: bounds.end })
      .then((r) => live && (setRows(r), setError(null)))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load this week.'))
    return () => {
      live = false
    }
  }, [supabase, bounds.start, bounds.end, version])

  const week = useMemo(
    () =>
      rows === null
        ? null
        : weeklySummary({
            entries: rows.map((r) => ({ postedOn: isoDate(r.posted_on), amountCents: r.amount_cents, categoryId: r.category_id })),
            categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, weeklyBudgetCents: c.weekly_budget_cents })),
            asOf,
          }),
    [rows, categories, asOf],
  )

  const isThisWeek = weekBounds(today).start === bounds.start
  // Back on this week, its days left count from today again, not its Monday.
  const step = (weeks: number) => {
    const next = shiftWeek(bounds.start, weeks)
    setAsOf(weekBounds(next).start === weekBounds(today).start ? today : next)
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{isThisWeek ? 'This week' : 'Week of'}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateRange(bounds.start, bounds.end)}
            {isThisWeek && week !== null ? ` · ${week.daysLeft} ${week.daysLeft === 1 ? 'day' : 'days'} left` : ''}
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

      {week === null && error === null ? <SkeletonCard /> : null}

      {week !== null ? (
        <>
          <Card>
            <CardHeader>
              <CardDescription>Spent</CardDescription>
              <p className="text-4xl font-bold tracking-tight">
                <Figure>{formatCents(week.spentCents)}</Figure>
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {week.budgetCents !== null && week.remainingCents !== null ? (
                <>
                  <Progress
                    basisPoints={week.usedBasisPoints ?? 10_000}
                    tone={week.remainingCents < 0 ? 'over' : 'default'}
                  />
                  <p className="text-sm">
                    {week.remainingCents >= 0 ? (
                      <>
                        <span className="tnum font-medium">{formatCents(week.remainingCents)}</span>{' '}
                        <span className="text-muted-foreground">left of {formatCents(week.budgetCents)} budgeted</span>
                      </>
                    ) : (
                      <>
                        <span className="tnum font-medium text-spend">{formatMagnitude(week.remainingCents)} over</span>{' '}
                        <span className="text-muted-foreground">a {formatCents(week.budgetCents)} budget</span>
                      </>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No weekly budgets set yet.{' '}
                  <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => navigate('settings')}>
                    Set one
                  </button>{' '}
                  to see what is left.
                </p>
              )}
              {week.inflowCents > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Money in this week: <span className="tnum text-income">{formatCents(week.inflowCents)}</span>
                </p>
              ) : null}
              {/* Left out of both figures above, so said out loud (D9). */}
              {week.transfersCents !== 0 ? (
                <p className="text-xs text-muted-foreground">
                  {week.transfersCents > 0 ? 'Paid to your card: ' : 'Moved out, not spending: '}
                  <span className="tnum">{formatMagnitude(week.transfersCents)}</span> — not counted
                </p>
              ) : null}
              {week.uncategorisedInCents > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Money in with no category: <span className="tnum">{formatCents(week.uncategorisedInCents)}</span> — not
                  counted
                </p>
              ) : null}
            </CardContent>
          </Card>

          {goal !== null ? <GoalCard weekSpentCents={week.spentCents} asOf={asOf} /> : <NoGoal />}

          <Card>
            <CardHeader>
              <CardTitle>By category</CardTitle>
            </CardHeader>
            <CardContent>
              {week.categories.length === 0 && week.uncategorisedSpentCents === 0 ? (
                <Empty icon={<Icon name="list" />} title="Nothing spent yet">
                  Import a statement or add a purchase and it will show up here once approved.
                </Empty>
              ) : (
                <ul className="space-y-4">
                  {week.categories.map((c) => (
                    <li key={c.categoryId} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="tnum shrink-0">
                          {formatCents(c.spentCents)}
                          {c.budgetCents !== null ? <span className="text-muted-foreground"> / {formatCents(c.budgetCents)}</span> : null}
                        </span>
                      </div>
                      {c.usedBasisPoints !== null ? (
                        <div className="flex items-center gap-3">
                          <Progress basisPoints={c.usedBasisPoints} tone={c.over ? 'over' : c.usedBasisPoints >= 8_500 ? 'near' : 'default'} />
                          <span className={`tnum w-10 shrink-0 text-right text-xs ${c.over ? 'text-spend' : 'text-muted-foreground'}`}>
                            {formatBasisPoints(c.usedBasisPoints)}
                          </span>
                        </div>
                      ) : null}
                    </li>
                  ))}
                  {week.uncategorisedSpentCents > 0 ? (
                    <li className="flex items-baseline justify-between text-sm text-muted-foreground">
                      <span>Uncategorised</span>
                      <span className="tnum">{formatCents(week.uncategorisedSpentCents)}</span>
                    </li>
                  ) : null}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
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
