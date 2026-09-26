/**
 * What the Coach speaks of today, as one Day (plan §2.3, A12): the line,
 * the cards (the forecast's last, A13), the active goals (main first) and the quote shortlist, all
 * from core's digest of a year of records and savings-coach's ranking.
 * The Coach draws it; the Month's line builds the very same Day in the
 * background when the day's words have not been asked for yet, so both
 * send one brief and share its words.
 */
import { useMemo } from 'react'
import type { FactsDigest } from '@budget/core'
import { forecastCard } from '@budget/savings-coach'
import { useAppData } from '../app-data.js'
import type { FundsState } from '../funds.js'
import { todayIso } from '../format.js'
import { todaysCards, todaysLine } from './CoachCards.js'
import { useCoachFacts, type DigestRows } from './facts.js'
import { goalsForCore } from './goals.js'
import type { Day } from './narration.js'
import { useQuotePick } from './QuoteCard.js'
import { useCoachSettings } from './settings.js'
import { notSubscriptionsOf, useDismissals, type Dismissals } from './dismissals.js'

export interface CoachDay {
  readonly digest: FactsDigest | 'failed' | null
  /** Null while the facts or the tone load. */
  readonly day: Day | null
  readonly pick: ReturnType<typeof useQuotePick>
  readonly asOf: string
  readonly dismissals: Dismissals
}

export function useCoachDay(read: DigestRows | 'failed' | null, funds: FundsState): CoachDay {
  const { goals, mainGoal } = useAppData()
  const coreGoals = useMemo(() => goalsForCore(goals, funds), [goals, funds])
  const dismissals = useDismissals()
  const { dismissed } = dismissals
  const notSubscriptions = useMemo(() => (dismissed === null ? null : notSubscriptionsOf(dismissed)), [dismissed])
  const digest = useCoachFacts(read, coreGoals, notSubscriptions)
  const settings = useCoachSettings()
  const asOf = todayIso()
  const facts = digest === null || digest === 'failed' ? null : digest.facts
  // The forecast's own card rides with the day's cards, so it is worded, kept and reused as they are.
  const forecast = useMemo(() => (digest === null || digest === 'failed' ? null : forecastCard(digest.forecast)), [digest])
  // What today is about, for the quote: the cards, then the day's line.
  // Which fact the line speaks of is the same in either tone.
  const topFacts = useMemo(() => {
    if (facts === null) return []
    const line = todaysLine(facts, 'cheerleader')
    return [...todaysCards(facts, dismissed ?? undefined).map((c) => c.fact), ...(line === null ? [] : [line.fact])]
  }, [facts, dismissed])
  const pick = useQuotePick(topFacts, mainGoal, asOf)
  const day = useMemo((): Day | null => {
    if (facts === null || settings === null || dismissed === null) return null
    const { tone, shareShopNames } = settings
    return {
      tone,
      shareShopNames,
      line: todaysLine(facts, tone),
      cards: [...todaysCards(facts, dismissed), ...(forecast === null ? [] : [forecast])],
      goals: goals
        .filter((g) => g.status === 'active')
        .map((g) => ({ id: g.id, name: g.name, main: g.id === mainGoal?.id, hasHours: g.unit_cost_cents !== null })),
      quotes: pick.shortlist,
    }
  }, [facts, forecast, settings, dismissed, goals, mainGoal, pick.shortlist])
  return { digest, day, pick, asOf, dismissals }
}
