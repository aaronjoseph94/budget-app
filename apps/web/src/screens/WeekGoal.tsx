import { goalProgress, isoDate, requiredWeeklyContribution, timeEquivalent } from '@budget/core'
import { useAppData } from '../app-data.js'
import { goalSavedCents, useFunds } from '../funds.js'
import { formatBasisPoints, formatCents } from '../format.js'
import { Icon } from '../components/ui/icons.js'
import { hashOf } from '../nav.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { cn } from '../lib/cn.js'

/**
 * The main goal on the Week (F45): how far along it is, what each week needs
 * to reach it by its date, and, for a goal with a cost an hour, the week's
 * spending as time towards it; then how many other goals there are, which
 * Savings lists. Every
 * figure is packages/core's (goalProgress, requiredWeeklyContribution,
 * timeEquivalent). On a desktop it stands where Weekly Budget has its chart
 * well, beside the summary: Mockup A's wide card tinted to the accent, with
 * a ring drawn from goalProgress's basis points and the percentage in it.
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

  const bp = progress.percentCompleteBasisPoints
  return (
    <section aria-label={goal.name} className={WIDE}>
      <div className="flex flex-col items-start gap-4 min-[480px]:flex-row min-[480px]:items-center md:gap-5">
        <span className="relative flex size-24 shrink-0 items-center justify-center">
          {/* The ring is the percentage beside it, drawn: a track in the soft
            accent and an arc of core's basis points, a length of 100. */}
          <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" className="stroke-primary-soft" />
            <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round" pathLength={100} strokeDasharray={`${bp / 100} 100`} className="stroke-primary" />
          </svg>
          <span className="tnum text-lg font-semibold">{formatBasisPoints(bp)}</span>
        </span>
        <div className="min-w-0 flex-1 space-y-1.5 text-[0.9375rem]">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name={goal.unit_cost_cents === null ? 'piggy' : 'plane'} className="size-4 text-primary" />
            <h2 className="text-lg font-semibold leading-snug">{goal.name}</h2>
          </div>
          <p>
            <span className="tnum font-semibold">{formatCents(savedCents)}</span>
            <span className="text-canvas-muted"> of {formatCents(goal.target_cents)} · {formatCents(progress.remainingCents)} to go</span>
          </p>
          {perWeek !== null ? (
            <p className="text-canvas-muted">
              Save <span className="tnum font-semibold text-foreground">{formatCents(perWeek)}</span> a week to get there by your date.
            </p>
          ) : null}
          {spentAsTime !== null ? (
            <p className="w-fit max-w-full rounded-sm bg-primary-soft px-2.5 py-1.5 text-sm">
              This week&apos;s spending is{' '}
              <span className="font-semibold">
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
        </div>
      </div>
    </section>
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
    <div className={cn(WIDE, 'text-[0.9375rem] text-canvas-muted')}>
      {goals.length === 0 ? 'No savings goal yet.' : 'No active savings goal.'}{' '}
      {/* A link in the sentence, 44 px to press by its padding (N76). */}
      <a href={hashOf({ screen: 'savings', param: null })} className={cn(SENTENCE_LINK, 'text-foreground')}>
        {goals.length === 0 ? 'Add a goal' : 'Resume or add one'}
      </a>{' '}
      to see what each week needs to reach it.
    </div>
  )
}

/** Mockup A's wide card, white to the accent's tint; muted words on it take `canvas-muted` (ADR 0010). */
const WIDE = 'min-w-0 rounded-xl border bg-linear-to-b from-card to-primary-tint p-4 md:px-6 md:py-[1.375rem]'
