/**
 * The check-in's questions (plan §2.4, A20): last week's biggest everyday
 * charges, each to mark Planned, Impulse or Needed, kept in 0017's
 * coach_answers. A shop's name is drawn as text, never markup. Without
 * 0017 the questions give way to one line pointing to One-time updates,
 * and the rest of the check-in still shows.
 */
import { useEffect, useState, type KeyboardEvent } from 'react'
import type { CheckinAnswer, CheckinQuestion, ImpulseShare } from '@budget/core'
import type { IsoDate } from '@budget/money-primitives'
import { useAppData } from '../app-data.js'
import { formatBasisPoints, formatCents, formatDayMonth } from '../format.js'
import { hashOf } from '../nav.js'
import { cn } from '../lib/cn.js'
import { Section } from '../forecast/parts.js'
import { readAnswers, saveAnswer, type AnswerRow } from './answers.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { TryAgain } from '../try-again.js'
import { arrowIndex } from '../lib/roving.js'

export interface CheckinAnswers {
  /** Charges answered when the check-in opened; null while they load. */
  readonly answeredAtOpen: readonly string[] | null
  readonly rows: readonly AnswerRow[]
  /** Every answer as it was when the check-in opened. */
  readonly rowsAtOpen: readonly AnswerRow[]
  readonly status: 'loading' | 'ready' | 'missing' | 'failed'
  readonly save: (row: AnswerRow) => Promise<boolean>
}

export function useCheckinAnswers(): CheckinAnswers {
  const { supabase, userId } = useAppData()
  const [state, setState] = useState<Omit<CheckinAnswers, 'save'>>({ status: 'loading', rows: [], rowsAtOpen: [], answeredAtOpen: null })
  useEffect(() => {
    let live = true
    void readAnswers(supabase).then((read) => {
      if (!live) return
      const rows = read.status === 'ready' ? read.rows : []
      setState({ status: read.status, rows, rowsAtOpen: rows, answeredAtOpen: rows.map((r) => r.transactionId) })
    })
    return () => void (live = false)
  }, [supabase])
  const save = async (row: AnswerRow) => {
    const kept = await saveAnswer(supabase, userId, row)
    if (kept) setState((s) => ({ ...s, rows: [...s.rows.filter((r) => r.transactionId !== row.transactionId), row] }))
    return kept
  }
  return { ...state, save }
}

/** Mockup A's 18px card title on the check-in's cards, which are flat (step 7). */
export const CHECKIN_CARD = '[&_h2]:text-lg'

const CHOICES: readonly { readonly answer: CheckinAnswer; readonly label: string }[] = [
  { answer: 'planned', label: 'Planned' },
  { answer: 'impulse', label: 'Impulse' },
  { answer: 'needed', label: 'Needed' },
]

export function CheckinQuestions(props: {
  questions: readonly CheckinQuestion[]
  week: IsoDate
  answers: CheckinAnswers
  impulse: ImpulseShare
  /** Each charge's shop, as the statement gave it. */
  shops: ReadonlyMap<string, string>
}) {
  const { questions, week, answers, impulse, shops } = props
  if (answers.status === 'missing') {
    return (
      <Section title="Was it planned?" className={CHECKIN_CARD}>
        <p>
          Your answers need a one-time update.{' '}
          <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
            See One-time updates
          </a>
        </p>
      </Section>
    )
  }
  if (answers.status === 'failed') {
    return (
      <Section title="Was it planned?" className={CHECKIN_CARD}>
        <p className="text-muted-foreground">Your answers did not load. <TryAgain />.</p>
      </Section>
    )
  }
  return (
    <Section title="Was it planned?" className={CHECKIN_CARD}>
      {questions.length === 0 ? <p className="text-muted-foreground">No everyday charges of $20.00 or more to ask about last week.</p> : null}
      <ul className="space-y-4">
        {questions.map((q) => (
          <Question key={q.transactionId} question={q} week={week} answers={answers} shop={shops.get(q.transactionId) ?? 'A charge'} />
        ))}
      </ul>
      {impulse.shareBp === null ? null : (
        <p className="text-muted-foreground">
          Over the last 8 weeks you called {formatBasisPoints(impulse.shareBp)} of {impulse.answers} {impulse.answers === 1 ? 'charge' : 'charges'} impulse.
        </p>
      )}
    </Section>
  )
}

function Question({ question, week, answers, shop }: { question: CheckinQuestion; week: IsoDate; answers: CheckinAnswers; shop: string }) {
  const [failed, setFailed] = useState(false)
  const chosen = answers.rows.find((r) => r.transactionId === question.transactionId)?.answer ?? null
  const choose = async (answer: CheckinAnswer) => setFailed(!(await answers.save({ transactionId: question.transactionId, answer, askedWeek: week })))
  return (
    <li className="space-y-2">
      <p className="[overflow-wrap:anywhere]">
        Was <span className="font-medium">{shop}</span>, <span className="tnum font-medium">{formatCents(question.chargeCents)}</span> on {formatDayMonth(question.postedOn)}, planned?
      </p>
      {/* Mockup A's segmented control, three across. Each answer is a button
        that says whether it is chosen; the arrow keys, Home and End move
        between the three and never answer, since an answer is saved. */}
      <div role="group" aria-label={`${shop}: planned, impulse or needed`} className="grid grid-cols-3 gap-1 rounded-md border bg-canvas p-1 sm:max-w-md">
        {CHOICES.map((c) => (
          <button
            key={c.answer}
            type="button"
            aria-pressed={chosen === c.answer}
            onKeyDown={onArrow}
            onClick={() => void choose(c.answer)}
            className={cn(
              'min-h-11 min-w-0 rounded-sm px-2 text-sm font-medium transition-colors [overflow-wrap:anywhere]',
              'outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
              chosen === c.answer ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      {failed ? <p role="alert">That answer wasn’t kept. Try again.</p> : null}
    </li>
  )
}

/** Moves focus along a question's three answers with the arrow keys, Home and End, wrapping. */
function onArrow(e: KeyboardEvent<HTMLButtonElement>) {
  const answers = [...(e.currentTarget.parentElement?.querySelectorAll('button') ?? [])]
  const at = answers.indexOf(e.currentTarget)
  const to = arrowIndex(e.key, at, answers.length)
  if (to === null) return
  e.preventDefault()
  answers[to]?.focus()
}
