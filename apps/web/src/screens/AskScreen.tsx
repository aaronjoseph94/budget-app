import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Answer, DebtPlanInput } from '@budget/core'
import { queryOf, type AskRead } from '@budget/savings-coach'
import { useAppData, parseMoneyInput } from '../app-data.js'
import { useFunds } from '../funds.js'
import { formatForInput, todayIso } from '../format.js'
import { hashOf } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent } from '../components/ui/card.js'
import { Input } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { MonthTitle } from '../components/ui/type.js'
import { HelpButton } from '../help/HelpButton.js'
import { ARTICLES, articleFor } from '../help/articles.js'
import type { HelpTopic } from '../help/topics.js'
import { useCoachRead } from '../coach/facts.js'
import { goalsForCore } from '../coach/goals.js'
import { notSubscriptionsOf, useDismissals } from '../coach/dismissals.js'
import { AnswerCard } from '../ask/AnswerCard.js'
import { answerOf, readDebts } from '../ask/answer.js'
import { readQuestion, type QuestionRead, type ReadBy } from '../ask/read.js'
import { suggestions } from '../ask/suggest.js'
import { forgetQuestions, keepQuestion, recentQuestions } from '../ask/recent.js'
import { takeHandedOver } from '../ask/handoff.js'
import { TryAgain } from '../try-again.js'

const link = 'inline-flex min-h-11 items-center font-medium underline underline-offset-4'
const TOPICS = ARTICLES.map((a) => ({ id: a.id, title: a.title }))

/** Why the app read the question itself, in one line with the one place that helps; nothing for a suggestion. */
function ReadByApp({ by }: { by: ReadBy }): ReactNode {
  if (by.by === 'ai' || by.why === 'chip') return null
  const to = (href: string, words: string) => (
    <a href={href} className={link}>
      {words}
    </a>
  )
  const why = by.why
  const line =
    why === 'unreadable' ? (
      <>The AI’s reading didn’t make sense, so the app read your question itself.</>
    ) : why.state === 'not_deployed' || why.state === 'needs_update' || why.state === 'helper_error' ? (
      <>The AI helper needs a one-time update, so the app read your question itself. {to(hashOf({ screen: 'help', param: 'updates' }), 'See One-time updates')}</>
    ) : why.state === 'not_set_up' ? (
      <>The app read your question itself. {to(hashOf({ screen: 'ai', param: null }), 'Turn on free AI (2 minutes)')}</>
    ) : why.state === 'off' ? (
      <>AI is off, so the app read your question itself.</>
    ) : why.state === 'limit_reached' || why.state === 'all_resting' || why.state === 'all_failed' ? (
      <>The AI is resting, so the app read your question itself. {to(hashOf({ screen: 'help', param: 'ai-rests' }), 'Why?')}</>
    ) : (
      <>{why.sentence} The app read your question itself.</>
    )
  return <p className="text-sm text-muted-foreground">{line}</p>
}

/**
 * Ask about your money (plan §2.7, A24): a question in the owner's own
 * words, read by the AI into an intent (or by the app, with AI off), and
 * answered by packages/core's answerQuery from the year the Coach reads.
 * Every figure is core's; the words are the app's own; this screen formats.
 * `topic` is the Help topic Ask was opened from ("Ask about this").
 */
export function AskScreen({ topic }: { topic: HelpTopic | null }) {
  const { supabase, categories, goals } = useAppData()
  const read = useCoachRead()
  const funds = useFunds()
  const coreGoals = useMemo(() => goalsForCore(goals, funds), [goals, funds])
  const { dismissed } = useDismissals()
  const [text, setText] = useState('')
  const [asked, setAsked] = useState<{ readonly question: string; readonly read: QuestionRead } | null>(null)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState<string | null>(null)
  const [debts, setDebts] = useState<DebtPlanInput | 'missing_update' | 'failed' | null>(null)
  const [recent, setRecent] = useState(recentQuestions)

  const ask = async (question: string, chip: boolean) => {
    if (question.trim() === '' || busy) return
    setBusy(true)
    setRecent(keepQuestion(question))
    // A payoff plan that failed to load (offline, say) is read again for
    // this question, rather than answer "failed" until Ask reopens (5de84f1).
    setDebts((d) => (d === 'failed' ? null : d))
    try {
      const reading = await readQuestion(supabase, { question, asOf: todayIso(), categories, topics: TOPICS, chip })
      setAsked({ question: question.trim(), read: reading })
      setAmount(reading.read.kind === 'intent' && reading.read.amountText !== null ? reading.read.amountText : null)
    } finally {
      setBusy(false)
    }
  }

  // A question typed in the Coach's box is asked as soon as Ask opens.
  useEffect(() => {
    const handed = takeHandedOver()
    if (handed === null) return
    setText(handed)
    void ask(handed, false)
    // Once, as Ask opens; the question is taken, so a second run finds none.
  }, [])

  const intent = asked?.read.read.kind === 'intent' ? asked.read.read : null
  // The payoff plan is read only for a question about it, on its own, so its failure is its answer's alone.
  const wantsDebts = intent?.intent === 'debt_free'
  useEffect(() => {
    if (!wantsDebts || debts !== null) return
    let live = true
    void readDebts(supabase).then((d) => live && setDebts(d))
    return () => void (live = false)
  }, [wantsDebts, debts, supabase])

  const answer = useMemo((): Answer | 'loading' | 'failed' | null => {
    if (intent === null) return null
    if (read === 'failed') return 'failed'
    if (read === null || coreGoals === null || dismissed === null || (wantsDebts && debts === null)) return 'loading'
    const monthly = amount === null ? null : parseMoneyInput(amount)
    try {
      return answerOf(
        { read, categories, goals: coreGoals, debts: typeof debts === 'object' ? debts : null, notSubscriptions: notSubscriptionsOf(dismissed) },
        queryOf(intent, monthly),
      )
    } catch {
      return 'failed'
    }
  }, [intent, read, coreGoals, dismissed, wantsDebts, debts, amount, categories])

  const missingUpdate =
    (typeof answer === 'object' && answer?.status === 'missing' && answer.what === 'debts' && debts === 'missing_update') ||
    (typeof answer === 'object' && answer?.status === 'missing' && answer.what === 'forecast' && typeof read === 'object' && read?.forecast?.status === 'failed' && read.forecast.missingUpdate)
  const about = topic === null ? undefined : articleFor(topic)

  return (
    <div className="space-y-4">
      {/* Ask has no sidebar item of its own; its way back is on the page (design-review P1 item 2). */}
      <a href={hashOf({ screen: 'coach', param: null })} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
        ← Coach
      </a>
      <div className="flex flex-wrap items-center gap-1">
        <MonthTitle>Ask</MonthTitle>
        <HelpButton screen="ask" />
      </div>
      <p className="-mt-2 text-muted-foreground md:text-[0.9375rem]">
        {about === undefined ? 'Ask about your money in your own words.' : `About: ${about.title}.`} The app works out every figure from your own records.
      </p>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(text, false)
        }}
      >
        <label htmlFor="ask-question" className="sr-only">
          Your question
        </label>
        <div className="flex gap-2">
          <Input
            id="ask-question"
            className="min-h-12 min-w-0 flex-1"
            placeholder="e.g. coffee in August?"
            value={text}
            maxLength={300}
            autoComplete="off"
            enterKeyHint="go"
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" className="min-h-12 shrink-0 px-4" disabled={busy}>
            <Icon name="sparkles" className="size-4" /> {busy ? 'Reading…' : 'Ask'}
          </Button>
        </div>
      </form>

      <div aria-live="polite" className="space-y-3">
        {asked === null ? null : <ReadByApp by={asked.read.by} />}
        {asked !== null && asked.read.read.kind !== 'intent' ? <NotAnIntent read={asked.read.read} topic={topic} onAsk={(q) => void ask(q, true)} /> : null}
        {intent === null || asked === null ? null : answer === 'loading' ? (
          <p className="text-sm text-muted-foreground">Working it out…</p>
        ) : answer === 'failed' ? (
          <p className="text-sm text-muted-foreground">Your records did not load, so this can’t be answered right now. <TryAgain />; everything else still works.</p>
        ) : answer === null ? null : (
          <AnswerCard read={intent} by={asked.read.by} names={intent.categoryIds.map((id) => categories.find((c) => c.id === id)?.name ?? '')} answer={answer} missingUpdate={missingUpdate}>
            {intent.intent === 'what_if_cut' ? <AmountChip amount={amount} answer={answer} fromQuestion={intent.amountText !== null} onChange={setAmount} /> : null}
          </AnswerCard>
        )}
      </div>

      {asked !== null && asked.read.read.kind === 'cannot' ? null : <Suggestions topic={topic} onAsk={(q) => void ask(q, true)} />}
      {recent.length === 0 ? null : (
        <section aria-label="Your last questions" className="space-y-1">
          <h2 className="text-[0.9375rem] font-semibold">Your last questions</h2>
          <ul>
            {recent.map((q) => (
              <li key={q}>
                <button type="button" className="min-h-11 w-full text-left text-muted-foreground underline-offset-4 hover:text-foreground hover:underline [overflow-wrap:anywhere] md:text-[0.9375rem]" onClick={() => void ask(q, false)}>
                  {q}
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={() => {
              forgetQuestions()
              setRecent([])
            }}
          >
            Clear these
          </Button>
          <p className="text-xs text-muted-foreground">Kept on this phone or computer only.</p>
        </section>
      )}
    </div>
  )
}

/** The amount a what-if saves a month: the owner's own words, or the suggestion, and theirs to change. */
function AmountChip({ amount, answer, fromQuestion, onChange }: { amount: string | null; answer: Answer; fromQuestion: boolean; onChange: (amount: string) => void }) {
  const figure = answer.status === 'answered' ? answer.main.figures['monthly'] : undefined
  const shown = amount ?? (figure?.unit === 'cents' ? formatForInput(figure.value) : '')
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-3 text-sm">
      <label htmlFor="ask-amount" className="font-medium">
        A month’s saving
      </label>
      <span className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted-foreground">
          $
        </span>
        <Input id="ask-amount" inset className="w-28" inputMode="decimal" autoComplete="off" value={shown} onChange={(e) => onChange(e.target.value)} />
      </span>
      <span className="text-muted-foreground">{fromQuestion ? 'From your question: change it to see another.' : 'Change it to see another.'}</span>
    </div>
  )
}

/** A Help answer, or "I can't answer that", with questions it can. */
function NotAnIntent({ read, topic, onAsk }: { read: Exclude<AskRead, { kind: 'intent' }>; topic: HelpTopic | null; onAsk: (q: string) => void }) {
  if (read.kind === 'help') {
    const article = articleFor(read.topic)
    if (article !== undefined) {
      return (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <h2 className="font-semibold">{article.title}</h2>
            <p className="text-sm">{article.summary}</p>
            <a href={hashOf({ screen: 'help', param: article.id })} className={link}>
              Open this article
            </a>
          </CardContent>
        </Card>
      )
    }
  }
  return (
    <div className="space-y-2">
      <p>I can’t answer that from your figures yet. Try one of these:</p>
      <Suggestions topic={topic} onAsk={onAsk} bare />
    </div>
  )
}

/** Questions the app answers by itself, so they work with AI off. */
function Suggestions({ topic, onAsk, bare = false }: { topic: HelpTopic | null; onAsk: (q: string) => void; bare?: boolean }) {
  return (
    <section aria-label="Suggested questions" className="space-y-2">
      {bare ? null : <h2 className="text-[0.9375rem] font-semibold">Try asking</h2>}
      <div className="flex flex-wrap gap-2">
        {suggestions(topic).map((q) => (
          <Button key={q} variant="outline" size="sm" className="h-auto min-h-11 whitespace-normal text-left" onClick={() => onAsk(q)}>
            {q}
          </Button>
        ))}
      </div>
    </section>
  )
}
