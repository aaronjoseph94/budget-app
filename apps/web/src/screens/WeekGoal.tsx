import { goalProgress, isoDate, requiredWeeklyContribution, timeEquivalent } from '@budget/core'
import { useAppData } from '../app-data.js'
import { formatBasisPoints, formatCents } from '../format.js'
import { Card, CardContent, CardTitle } from '../components/ui/card.js'
import { Badge, Progress } from '../components/ui/feedback.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'

/**
 * The flight goal on the Week: how far along it is, what each week needs to
 * reach it by its date, and the week's spending as time towards it. Every
 * figure is packages/core's (goalProgress, requiredWeeklyContribution,
 * timeEquivalent). On a desktop it stands where Weekly Budget has its chart
 * well, beside the summary.
 */
export function GoalCard({ weekSpentCents, asOf }: { weekSpentCents: number; asOf: string }) {
  const { goal } = useAppData()
  if (goal === null) return null
  const saving = {
    name: goal.name,
    targetCents: goal.target_cents,
    savedCents: goal.saved_cents,
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
          <Icon name="plane" className="size-4 text-muted-foreground" />
          <CardTitle>{goal.name}</CardTitle>
        </div>
        <Badge variant="outline">{formatBasisPoints(progress.percentCompleteBasisPoints)}</Badge>
      </div>
      <CardContent className="space-y-3">
        <Progress basisPoints={progress.percentCompleteBasisPoints} />
        <p className="text-sm">
          <span className="tnum font-medium">{formatCents(goal.saved_cents)}</span>
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
      </CardContent>
    </Card>
  )
}

/** Where the goal stands when there is none: a way to set one, which also keeps the Week's cards in their places. */
export function NoGoal() {
  return (
    <Card className="order-0 xl:order-1">
      <CardContent className="pt-5 text-sm text-muted-foreground">
        No savings goal yet.{' '}
        <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => navigate('settings')}>
          Set a goal
        </button>{' '}
        to see what each week needs to reach it.
      </CardContent>
    </Card>
  )
}
