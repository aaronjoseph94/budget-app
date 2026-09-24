import { goalProgress, timeEquivalent } from '@budget/core'
import { useAppData } from '../app-data.js'
import { goalSavedCents, useFunds } from '../funds.js'
import { formatBasisPoints, formatCents } from '../format.js'
import { hashOf } from '../nav.js'
import { Card, CardContent, CardTitle } from '../components/ui/card.js'
import { Icon } from '../components/ui/icons.js'
import { HelpButton } from '../help/HelpButton.js'
import { CoachCards, DayLine } from '../coach/CoachCards.js'
import { useCoachFacts } from '../coach/facts.js'

/**
 * The Coach (plan §2.3): the day's line, the flight card, and up to three
 * cards on what changed, each with one action and "Why am I seeing this?"
 * (A07). What to cut and the quote arrive with A08, the AI's words with A12.
 *
 * It needs no one-time update, no AI helper and no key: the facts are
 * packages/core's digest of a year of the owner's own records, read here
 * off the Month's path, and the words are the app's own. The flight card
 * reads the goal and the funds Savings reads. This screen formats figures;
 * it never computes one.
 */
export function CoachScreen() {
  const digest = useCoachFacts()
  const facts = digest === null || digest === 'failed' ? null : digest.facts
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Coach</h1>
        <HelpButton screen="coach" />
      </div>
      <p className="text-xs text-muted-foreground">In the app’s own words, from your records.</p>
      {facts === null ? null : <DayLine facts={facts} className="text-lg font-medium leading-snug" />}
      <FlightCard />
      <CoachCards digest={digest} />
    </div>
  )
}

function FlightCard() {
  const { mainGoal: goal } = useAppData()
  const funds = useFunds()
  if (goal === null) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5 text-sm">
          <p className="font-medium">No goal yet.</p>
          <p className="text-muted-foreground">Set what you are saving for, and the Coach shows how far you have come.</p>
          <a href={hashOf({ screen: 'settings', param: null })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
            Set a goal
          </a>
        </CardContent>
      </Card>
    )
  }

  const savedCents = goalSavedCents(goal, funds)
  const { percentCompleteBasisPoints: bp } = goalProgress({ name: goal.name, targetCents: goal.target_cents, savedCents })
  // Whole hours of each, by the same conversion (F33). Nothing saved yet is
  // 0 h; a fund with more taken out than put in has no hours to show.
  const hours =
    goal.unit_cost_cents === null || savedCents < 0
      ? null
      : { saved: timeEquivalent(savedCents, goal.unit_cost_cents).hours, target: timeEquivalent(goal.target_cents, goal.unit_cost_cents).hours }

  return (
    <Card>
      <div className="flex items-center gap-2 p-5 pb-3">
        <Icon name="plane" className="size-4 text-muted-foreground" />
        <CardTitle as="h2">{goal.name}</CardTitle>
      </div>
      <CardContent className="flex items-center gap-4">
        <Ring basisPoints={bp} />
        <div className="min-w-0 space-y-1">
          {hours !== null ? (
            <p>
              <span className="tnum text-2xl font-bold">
                {hours.saved} h of {hours.target} h
              </span>
              <span className="block text-sm text-muted-foreground">of {goal.unit_label ?? 'your goal'}</span>
            </p>
          ) : null}
          <p className="text-sm">
            <span className="tnum font-medium">{formatCents(savedCents)}</span>
            <span className="text-muted-foreground"> saved of {formatCents(goal.target_cents)}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * How far along, as a ring. Its length is core's basis points against a
 * path length of 10,000, so drawing it divides nothing; clamped for drawing
 * only, and the figure in the middle is the true one.
 */
function Ring({ basisPoints }: { basisPoints: number }) {
  const drawn = Math.min(10_000, Math.max(0, basisPoints))
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 100 100" className="size-24 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" className="stroke-secondary" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          strokeWidth="10"
          strokeLinecap={drawn > 0 ? 'round' : 'butt'}
          pathLength={10_000}
          strokeDasharray={`${drawn} 10000`}
          className="stroke-primary"
        />
      </svg>
      <span className="tnum absolute inset-0 flex items-center justify-center text-lg font-semibold">
        {formatBasisPoints(basisPoints)}
      </span>
    </div>
  )
}
