import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { goalsProgress, impulseShare, isoDate } from '@budget/core'
import { checkinFacts, type Checkin, type CheckinFacts } from '@budget/savings-coach'
import type { AiProvider } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { goalSavedCents, useFunds } from '../funds.js'
import { formatCents, formatDateRange, formatDayMonth, todayIso } from '../format.js'
import { setWeeklyBudget } from '../ledger.js'
import { hashOf } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { LineLink } from '../ai/LineLink.js'
import { HelpButton } from '../help/HelpButton.js'
import { Section } from '../forecast/parts.js'
import { useCoachRead } from '../coach/facts.js'
import { checkinFigures, type CheckinFigures } from '../coach/checkin.js'
import { useCheckinWords, type CheckinWordsState } from '../coach/use-checkin-words.js'
import { markCheckinSeen } from '../coach/checkin-seen.js'
import { CoachText } from '../coach/words.js'
import { CheckinQuestions, useCheckinAnswers } from '../coach/CheckinQuestions.js'

const link = 'inline-flex min-h-11 items-center font-medium underline underline-offset-4'

/**
 * The Sunday check-in (plan §2.4, A20): last week's recap and a win, the
 * week's biggest everyday charges to mark Planned, Impulse or Needed, one
 * thing to try with a one-tap weekly limit, and a line for the goals.
 *
 * Every figure is core's (F42); the words are the app's own, in the
 * owner's tone, so the check-in is whole with AI off. The weekly limit is
 * written only when its button is tapped, through the Week's own save.
 * Without 0017 only the questions give way, to one line.
 */
export function CheckinScreen() {
  // Opened: the Coach tab's dot goes until next Sunday's check-in.
  useEffect(() => markCheckinSeen(todayIso()), [])
  const read = useCoachRead()
  const { categories } = useAppData()
  const answers = useCheckinAnswers()
  const computed = useMemo((): CheckinFigures | 'failed' | null => {
    if (read === null || answers.answeredAtOpen === null) return read === 'failed' ? 'failed' : null
    if (read === 'failed') return 'failed'
    try {
      // The answers as they were at open, so the words' facts hold still while the owner answers.
      return checkinFigures(read, categories, answers.answeredAtOpen, answers.rowsAtOpen)
    } catch {
      return 'failed'
    }
  }, [read, categories, answers.answeredAtOpen, answers.rowsAtOpen])
  // The impulse share as it stands, with each answer given here.
  const impulse = useMemo(() => (read === null || read === 'failed' ? null : impulseShare({ asOf: isoDate(read.asOf), answers: answers.rows })), [read, answers.rows])
  const { goals, mainGoal } = useAppData()
  // Worked out once, as the check-in opens: tapping the weekly limit re-reads the app's data,
  // and last week's check-in must not change under the owner, or ask the AI again, when it does.
  const [opened, setOpened] = useState<{ figures: CheckinFigures; facts: CheckinFacts } | 'failed' | null>(null)
  useEffect(() => {
    if (opened !== null || computed === null) return
    if (computed === 'failed') return setOpened('failed')
    const active = goals.filter((g) => g.status === 'active')
    const named = active.map((g) => ({ id: g.id, name: g.name, main: g.id === mainGoal?.id, hasHours: g.unit_cost_cents !== null }))
    setOpened({ figures: computed, facts: checkinFacts({ ...computed, goals: named, nameOf: (id) => categories.find((c) => c.id === id)?.name ?? 'A category' }) })
  }, [opened, computed, goals, mainGoal, categories])
  const figures = opened === null || opened === 'failed' ? opened : opened.figures
  const facts = opened === null || opened === 'failed' ? null : opened.facts
  const shops = useMemo(() => new Map(read === null || read === 'failed' ? [] : read.rows.map((r) => [r.id, r.merchant_raw])), [read])
  const said = useCheckinWords(facts, figures === null || figures === 'failed' ? null : figures.recap.week.start)
  const words = said?.checkin ?? null

  return (
    <div className="space-y-4">
      <a href={hashOf({ screen: 'coach', param: null })} className={`${link} text-sm`}>
        ← Coach
      </a>
      <div className="flex flex-wrap items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your Sunday check-in</h1>
        <HelpButton screen="coach" topic="checkin" />
      </div>
      {figures === 'failed' ? <p className="text-muted-foreground">The check-in did not load. Reload to try again.</p> : null}
      {figures === null || figures === 'failed' || facts === null || said === null || words === null || impulse === null ? (
        figures === 'failed' ? null : <p className="text-muted-foreground">Looking back at last week…</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">The week of {formatDateRange(figures.recap.week.start, figures.recap.week.end)}</p>
          <LastWeek figures={figures} facts={facts} words={words} />
          <CheckinQuestions questions={figures.questions} week={figures.recap.week.start} answers={answers} impulse={impulse} shops={shops} />
          <TryThis figures={figures} facts={facts} words={words} />
          <Goals facts={facts} words={words} />
          <Whose state={said} />
        </>
      )}
    </div>
  )
}

/** A part's words, drawn as text with the engine's figures in its blanks, and ✨ on the AI's. */
function Said({ part, facts }: { part: Checkin[keyof Checkin]; facts: CheckinFacts }) {
  if (part === null) return null
  return (
    <span aria-live="polite">
      {part.ai ? (
        <>
          <span aria-hidden="true">✨ </span>
          <span className="sr-only">Written by AI: </span>
        </>
      ) : null}
      <CoachText text={part.text} facts={{ ...facts.facts, ...facts.goals }} />
    </span>
  )
}

const BY: Readonly<Record<AiProvider, string>> = { gemini: 'free Google Gemini', groq: 'free Groq', openrouter: 'free OpenRouter', openai: 'OpenAI', anthropic: 'Anthropic' }

/** Whose words these are, and why the app's own show when the AI's do not. */
function Whose({ state }: { state: CheckinWordsState }) {
  const { status, view, provider } = state
  let said: ReactNode = 'In the app’s own words, from your records.'
  if (status === 'looking') said = 'Looking for this week’s AI words. The app’s own show meanwhile.'
  else if (status === 'asking') said = 'Asking the AI for this week’s words. The app’s own show meanwhile.'
  else if (status === 'ai' && provider !== null) said = `✨ Words by AI (${BY[provider]}) from your numbers. Every figure is the app’s own.`
  else if (view !== null) {
    said = (
      <>
        {view.sentence}{' '}
        <LineLink view={view} />
      </>
    )
  }
  return <p className="text-xs text-muted-foreground">{said}</p>
}

function LastWeek({ figures, facts, words }: { figures: CheckinFigures; facts: CheckinFacts; words: Checkin }) {
  const { recap } = figures
  return (
    <Section title="Last week">
      {recap.status === 'not_covered' ? (
        <p>
          {recap.coveredFrom === null
            ? 'There are no records yet, so there is no recap this week. Import a statement and it starts with your first whole week.'
            : `Your records start on ${formatDayMonth(recap.coveredFrom)}, so last week isn’t all there. The recap starts with your first whole week.`}
        </p>
      ) : (
        <p className="[overflow-wrap:anywhere]">
          <Said part={words.recap} facts={facts} />
        </p>
      )}
      <p className="font-medium [overflow-wrap:anywhere]">
        <Said part={words.win} facts={facts} />
      </p>
    </Section>
  )
}

/**
 * One thing to try, and the commitment: the suggested limit written as the
 * category's weekly budget when, and only when, the button is tapped.
 */
function TryThis({ figures, facts, words }: { figures: CheckinFigures; facts: CheckinFacts; words: Checkin }) {
  const { supabase, categories, refresh } = useAppData()
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const { limit } = figures
  const name = limit === null ? null : (categories.find((c) => c.id === limit.categoryId)?.name ?? null)
  const commit = async () => {
    if (limit === null) return
    setState('saving')
    try {
      await setWeeklyBudget(supabase, limit.categoryId, limit.limitCents)
      setState('saved')
      // Re-reads the categories, which carry the weekly budgets, so the Week shows it.
      await refresh()
    } catch {
      setState('failed')
    }
  }
  return (
    <Section title="One thing to try">
      <p className="[overflow-wrap:anywhere]">
        <Said part={words.tryThis} facts={facts} />
      </p>
      {limit === null || name === null ? null : (
        <div className="space-y-2 rounded-lg bg-muted/60 p-3">
          <p className="font-medium [overflow-wrap:anywhere]">
            Keep {name} under <span className="tnum">{formatCents(limit.limitCents)}</span> next week?
          </p>
          {state === 'saved' ? (
            <p role="status">
              Done: {name}’s weekly budget is {formatCents(limit.limitCents)}. It shows on the{' '}
              <a href={hashOf({ screen: 'week', param: null })} className={SENTENCE_LINK}>
                Week
              </a>
              .
            </p>
          ) : (
            <Button onClick={() => void commit()} disabled={state === 'saving'}>
              {limit.from === 'budget' ? 'Yes, keep it' : 'Yes, set it'}
            </Button>
          )}
          {state === 'failed' ? <p role="alert">The weekly budget wasn’t saved. Try again, or set it on the Week.</p> : null}
        </div>
      )}
    </Section>
  )
}

/** A line for the goals, then each active goal's progress, the main goal first (G1). */
function Goals({ facts, words }: { facts: CheckinFacts; words: Checkin }) {
  const { goals, mainGoal } = useAppData()
  const funds = useFunds()
  const active = goals.filter((g) => g.status === 'active').sort((a, b) => (a.id === mainGoal?.id ? -1 : b.id === mainGoal?.id ? 1 : 0))
  if (active.length === 0) return null
  const { goals: figures } = goalsProgress({
    goals: active.map((g) => ({ id: g.id, targetCents: g.target_cents, savedCents: goalSavedCents(g, funds), unitCostCents: g.unit_cost_cents })),
  })
  return (
    <Section title={active.length === 1 ? 'Your goal' : 'Your goals'}>
      <p className="[overflow-wrap:anywhere]">
        <Said part={words.goal} facts={facts} />
      </p>
      <ul className="space-y-1">
        {figures.map((f) => {
          const goal = active.find((g) => g.id === f.id)!
          return (
            <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 truncate font-medium" title={goal.name}>
                {goal.name}
              </span>
              {/* Whole on its line where it fits; it may break at "of" (N58). */}
              <span className="tnum max-w-full text-muted-foreground">
                {f.hours === null ? `${formatCents(f.savedCents)} of ${formatCents(f.targetCents)}` : `${f.hours.saved} h of ${f.hours.target} h`}
              </span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
