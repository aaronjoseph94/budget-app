import { useMemo } from 'react'
import type { Spread } from '@budget/core'
import { useAppData } from '../app-data.js'
import { useFunds } from '../funds.js'
import { hashOf } from '../nav.js'
import { GoalPace } from '../coach/GoalPace.js'
import type { DigestRows } from '../coach/facts.js'
import { goalsForCore } from '../coach/goals.js'
import { useGoalOutlooks } from '../coach/outlook.js'
import { Section } from './parts.js'
import { WhatIfPanel } from './WhatIf.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { TryAgain } from '../try-again.js'

/**
 * When each active goal is reached (F33), every active goal with the main
 * goal first (G1), and What if… for the one chosen. The goals and their
 * pace are the Coach's (goalsForCore, useGoalOutlooks); without the funds'
 * read, one line says why and the rest of the Forecast shows.
 */
export function GoalsAheadCard({ read, end, month }: { read: DigestRows; end: Spread | null; month: string }) {
  const { goals } = useAppData()
  const funds = useFunds()
  const core = useMemo(() => goalsForCore(goals, funds), [goals, funds])
  const outlooks = useGoalOutlooks(read, core)
  const title = 'When you’ll reach your goals'
  if (funds.status === 'failed') {
    return (
      <Section title={title} large>
        {funds.missingUpdate ? (
          <p>
            Your goals’ dates need a one-time update.{' '}
            <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
              See One-time updates
            </a>
          </p>
        ) : (
          <p className="text-muted-foreground">Your goals’ dates did not load. <TryAgain />.</p>
        )}
      </Section>
    )
  }
  if (core === null || outlooks.status === 'loading') return <Section title={title} large><p className="text-muted-foreground">Working out your goals’ dates…</p></Section>
  if (outlooks.status === 'failed') return <Section title={title} large><p className="text-muted-foreground">Your goals’ dates did not load. <TryAgain />.</p></Section>
  if (core.length === 0) {
    return (
      <Section title={title} large>
        <p>
          No active goal.{' '}
          <a href={hashOf({ screen: 'savings', param: null })} className={SENTENCE_LINK}>
            Add one on Savings
          </a>
        </p>
      </Section>
    )
  }
  return (
    <Section title={title} large>
      <ul className="divide-y border-t">
        {core.map((g) => (
          <li key={g.id} className="space-y-1 py-3">
            <h3 className="font-semibold [overflow-wrap:anywhere]">{g.name}</h3>
            {outlooks.byGoal.has(g.id) ? <GoalPace forecast={outlooks.byGoal.get(g.id)!.forecast} targetDate={g.targetDate} /> : null}
          </li>
        ))}
      </ul>
      <WhatIfPanel goals={core} outlooks={outlooks.byGoal} end={end} month={month} asOf={read.asOf} />
    </Section>
  )
}
