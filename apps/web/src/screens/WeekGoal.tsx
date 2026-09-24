import { goalProgress, isoDate, requiredWeeklyContribution, timeEquivalent } from '@budget/core'
import { useAppData } from '../app-data.js'
import { goalSavedCents, useFunds } from '../funds.js'
import { formatBasisPoints, formatCents } from '../format.js'
import { Card, CardContent, CardTitle } from '../components/ui/card.js'
import { Badge, Progress } from '../components/ui/feedback.js'
import { Icon } from '../components/ui/icons.js'
import { hashOf, navigate } from '../nav.js'

/**
 * The main goal on the Week (F45): how far along it is, what each week needs
 * to reach it by its date, and, for a goal with a cost an hour, the week's
 * spending as time towards it; then how many other goals there are, which
 * Savings lists. Every
 * figure is packages/core's (goalProgress, requiredWeeklyContribution,
 * timeEquivalent). On a desktop it stands where Weekly Budget has its chart
 * well, beside the summary.
 */
export function GoalCard({ weekSpentCents, asOf }: { weekSpentCents: number; asOf: string }) {
  const { mainGoal: goal, goals } = useAppData()
  const funds = useFunds()
  if (goal === null) return null
  const others = goals.filter((g) => g.status === 'active' && g.id !== goal.id).length
  const savedCents = goalSavedCents(goal, funds)
  const saving = {
    name: goal.name,
    targetCents: goal.target_cents,
    savedCents,
    ...(goal.unit_cost_cents !== null ? { unitCostCents: goal.unit_cost_cents } : {}),
    ...(goal.unit_label !== null ? { unitLabel: goal.unit_label } : {}),
  }
  const progress = goalProgress(saving)
  const spentAsTime = goal.unit_cost_cents !== null && weekSpentCents > 0 ? timeEquivalent(weekSpentCents, goal.unit_cost_cents) : null
  const perWeek =
    goal.target_date !== null && goal.target_date > asOf
      ? requiredWeeklyContribution(saving, isoDate(asOf), isoDate(goal.target_date))
      : null

  return (
    <Card className="order-0 xl:order-1">
      <div className="flex items-center justify-between gap-2 p-5 pb-3">
        <div className="flex items-center gap-2">
          <Icon name={goal.unit_cost_cents === null ? 'piggy' : 'plane'} className="size-4 text-muted-foreground" />
          <CardTitle as="h2">{goal.name}</CardTitle>
        </div>
        <Badge variant="outline">{formatBasisPoints(progress.percentCompleteBasisPoints)}</Badge>
      </div>
      <CardContent className="space-y-3">
        <Progress basisPoints={progress.percentCompleteBasisPoints} />
        <p className="text-sm">
          <span className="tnum font-medium">{formatCents(savedCents)}</span>
          <span className="text-muted-foreground"> of {formatCents(goal.target_cents)} · {formatCents(progress.remainingCents)} to go</span>
        </p>
        {perWeek !== null ? (
          <p className="text-sm text-muted-foreground">
            Save <span className="tnum font-medium text-foreground">{formatCents(perWeek)}</span> a week to get there by your date.
          </p>
        ) : null}
        {spentAsTime !== null ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            This week&apos;s spending is{' '}
            <span className="font-medium">
              {spentAsTime.hours > 0 ? `${spentAsTime.hours} h ` : ''}
              {spentAsTime.minutes} min
            </span>{' '}
            of {goal.unit_label ?? 'your goal'}.
          </p>
        ) : null}
        {others === 0 ? null : (
          <a href={hashOf({ screen: 'savings', param: null })} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
            {others === 1 ? '1 other goal' : `${others} other goals`}
          </a>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Where the goal stands when none leads: a way to add one, or to resume one
 * paused or reached, on Savings, which also keeps the Week's cards in their
 * places.
 */
export function NoGoal() {
  const { goals } = useAppData()
  return (
    <Card className="order-0 xl:order-1">
      <CardContent className="pt-5 text-sm text-muted-foreground">
        {goals.length === 0 ? 'No savings goal yet.' : 'No active savings goal.'}{' '}
        <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => navigate('savings')}>
          {goals.length === 0 ? 'Add a goal' : 'Resume or add one'}
        </button>{' '}
        to see what each week needs to reach it.
      </CardContent>
    </Card>
  )
}
