import { useMemo } from 'react'
import { goalsProgress } from '@budget/core'
import { useAppData } from '../app-data.js'
import { goalSavedCents, useFunds, type FundsState } from '../funds.js'
import { formatBasisPoints, formatCents } from '../format.js'
import { hashOf, navigate } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardTitle } from '../components/ui/card.js'
import { Progress } from '../components/ui/feedback.js'
import { Icon } from '../components/ui/icons.js'
import { HelpButton } from '../help/HelpButton.js'
import { CoachCards, DayLine, ForecastCard, Said } from '../coach/CoachCards.js'
import { CoachStatus } from '../coach/CoachStatus.js'
import { useCoachDay } from '../coach/day.js'
import type { Words } from '../coach/narration.js'
import { useNarration } from '../coach/use-narration.js'
import { QuoteCard } from '../coach/QuoteCard.js'
import { useCoachRead } from '../coach/facts.js'
import { goalsForCore } from '../coach/goals.js'
import { GoalLever } from '../coach/GoalLever.js'
import { GoalPace, paceShort } from '../coach/GoalPace.js'
import { useGoalOutlooks, type Outlooks } from '../coach/outlook.js'
import { CheckinLink } from '../coach/CheckinLink.js'
import { AskBox } from '../coach/AskBox.js'
import type { ListedGoalRow } from '../ledger.js'

/**
 * The Coach (plan §2.3): the day's line, the main goal's card with the
 * other goals under it (G1), and up to three cards on what changed, each
 * with one action and "Why am I seeing this?" (A07); each goal's date at
 * the owner's pace (A08); a line of encouragement for the goals, and each
 * part's words chosen by coach/narration.ts (A12).
 *
 * It needs no one-time update, no AI helper and no key: the facts are
 * packages/core's digest of a year of the owner's own records, read here
 * off the Month's path, and the words are the app's own. The goals' card
 * reads the goals and the funds Savings reads. This screen formats figures;
 * it never computes one.
 */
export function CoachScreen() {
  const read = useCoachRead()
  const funds = useFunds()
  const { goals } = useAppData()
  const coreGoals = useMemo(() => goalsForCore(goals, funds), [goals, funds])
  const outlooks = useGoalOutlooks(read, coreGoals)
  const { digest, day, pick, asOf, dismissals } = useCoachDay(read, funds)
  const narrated = useNarration(day, asOf, true)
  const { narration } = narrated
  const quote = narration?.quote ?? null
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Coach</h1>
        <HelpButton screen="coach" />
      </div>
      <CoachStatus state={narrated} />
      <DayLine words={narration?.line ?? null} className="text-lg font-medium leading-snug" />
      <GoalsCard funds={funds} outlooks={outlooks} words={narration?.goal ?? null} />
      <CheckinLink />
      <CoachCards
        digest={digest}
        cards={day?.cards ?? null}
        narration={narration}
        onDismiss={dismissals.canDismiss ? (card) => void dismissals.dismiss(card.fact.cause) : null}
      />
      <ForecastCard cards={day?.cards ?? null} narration={narration} />
      {/* Picked once the facts are in, so the day's pick does not change under the owner. */}
      {digest === null ? null : (
        <QuoteCard entry={quote === null ? pick.entry : (pick.shortlist.find((e) => e.id === quote.id) ?? pick.entry)} why={quote?.why ?? null} asOf={asOf} />
      )}
      <AskBox />
    </div>
  )
}

/**
 * The main goal (F45), large, with the other active goals listed under it.
 * A goal with a cost an hour shows its hours, as flight training does; one
 * without is in dollars. Saved is the fund's kept balance (D16), and every
 * figure is core's goalsProgress.
 */
function GoalsCard({ funds, outlooks, words }: { funds: FundsState; outlooks: Outlooks; words: Words | null }) {
  const { goals, mainGoal } = useAppData()
  if (mainGoal === null) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5 text-sm">
          <p className="font-medium">{goals.length === 0 ? 'No goal yet.' : 'No active goal.'}</p>
          <p className="text-muted-foreground">
            {goals.length === 0
              ? 'Add what you are saving for, and the Coach shows how far you have come.'
              : 'Your goals are paused or reached. Resume one, or add another, and the Coach shows it here.'}
          </p>
          <a href={hashOf({ screen: 'savings', param: null })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
            {goals.length === 0 ? 'Add a goal' : 'Open Savings'}
          </a>
        </CardContent>
      </Card>
    )
  }

  const active = goals.filter((g) => g.status === 'active')
  const { goals: figures } = goalsProgress({
    goals: active.map((g) => ({ id: g.id, targetCents: g.target_cents, savedCents: goalSavedCents(g, funds), unitCostCents: g.unit_cost_cents })),
  })
  const [main, ...others] = figures
  if (main === undefined) return null
  return (
    <Card>
      <div className="flex items-center gap-2 p-5 pb-3">
        <Icon name={mainGoal.unit_cost_cents === null ? 'piggy' : 'plane'} className="size-4 text-muted-foreground" />
        <CardTitle as="h2">{mainGoal.name}</CardTitle>
      </div>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Ring basisPoints={main.progressBp} />
          <div className="min-w-0 space-y-1">
            {main.hours !== null ? (
              <p>
                <span className="tnum text-2xl font-bold">
                  {main.hours.saved} h of {main.hours.target} h
                </span>
                <span className="block text-sm text-muted-foreground">of {mainGoal.unit_label ?? 'your goal'}</span>
              </p>
            ) : null}
            <p className="text-sm">
              <span className="tnum font-medium">{formatCents(main.savedCents)}</span>
              <span className="text-muted-foreground"> saved of {formatCents(main.targetCents)}</span>
            </p>
          </div>
        </div>
        {words === null ? null : (
          <p className="words-in text-sm [overflow-wrap:anywhere]">
            <Said words={words} />
          </p>
        )}
        <MainOutlook outlooks={outlooks} funds={funds} goal={mainGoal} />
        {others.length === 0 ? null : (
          <div className="border-t pt-3">
            <h3 className="text-sm font-medium">Your other goals</h3>
            <ul className="mt-2 space-y-3">
              {others.map((f) => {
                const name = active.find((g) => g.id === f.id)?.name
                return (
                  <li key={f.id} className="space-y-1">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span className="min-w-0 truncate font-medium" title={name}>
                        {name}
                      </span>
                      <span className="tnum whitespace-nowrap text-muted-foreground">
                        {formatCents(f.savedCents)} of {formatCents(f.targetCents)}
                      </span>
                    </p>
                    <Progress basisPoints={f.progressBp} />
                    {funds.status !== 'failed' && outlooks.status === 'ready' && outlooks.byGoal.has(f.id) ? (
                      <p className="text-xs text-muted-foreground">{paceShort(outlooks.byGoal.get(f.id)!.forecast)}</p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            <a href={hashOf({ screen: 'savings', param: null })} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
              All your goals on Savings
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * When the main goal is reached at the owner's pace (F33), or why that is
 * not shown, and the top lever that gets it there sooner (F34). What if…
 * opens the Forecast, whose what-ifs start on the main goal (plan A14).
 */
function MainOutlook({ outlooks, funds, goal }: { outlooks: Outlooks; funds: FundsState; goal: ListedGoalRow }) {
  const { categories } = useAppData()
  // Without the funds, what moved into the goal is unknown: say why, never "on no fund".
  if (funds.status === 'failed') {
    return funds.missingUpdate ? (
      <p className="text-sm">
        When you will get there needs a one-time update.{' '}
        <a href={hashOf({ screen: 'help', param: 'updates' })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
          See One-time updates
        </a>
      </p>
    ) : (
      <p className="text-sm text-muted-foreground">When you will get there did not load. Reload to try again.</p>
    )
  }
  if (outlooks.status === 'loading') return <p className="text-sm text-muted-foreground">Working out when you will get there…</p>
  if (outlooks.status === 'failed') {
    return <p className="text-sm text-muted-foreground">When you will get there did not load. Reload to try again.</p>
  }
  const outlook = outlooks.byGoal.get(goal.id)
  if (outlook === undefined) return null
  const top = outlook.levers.offered[0]
  const category = top === undefined ? undefined : categories.find((c) => c.id === top.categoryId)
  return (
    <div className="space-y-3">
      <GoalPace forecast={outlook.forecast} targetDate={goal.target_date} />
      {top === undefined || category === undefined ? null : (
        <div className="space-y-2 rounded-lg bg-muted/60 p-3">
          <GoalLever lever={top} categoryName={category.name} unitLabel={goal.unit_label} />
          <Button variant="outline" size="sm" onClick={() => navigate('forecast')}>
            What if… <Icon name="chevronRight" className="size-4" />
          </Button>
        </div>
      )}
    </div>
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
