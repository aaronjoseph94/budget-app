/**
 * The check-in's questions (plan §2.4, A20): last week's biggest everyday
 * charges, each to mark Planned, Impulse or Needed, kept in 0017's
 * coach_answers. A shop's name is drawn as text, never markup. Without
 * 0017 the questions give way to one line pointing to One-time updates,
 * and the rest of the check-in still shows.
 */
import { useEffect, useState } from 'react'
import type { CheckinAnswer, CheckinQuestion, ImpulseShare } from '@budget/core'
import type { IsoDate } from '@budget/money-primitives'
import { useAppData } from '../app-data.js'
import { formatBasisPoints, formatCents, formatDayMonth } from '../format.js'
import { hashOf } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { Section } from '../forecast/parts.js'
import { readAnswers, saveAnswer, type AnswerRow } from './answers.js'

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
      <Section title="Was it planned?">
        <p>
          Your answers need a one-time update.{' '}
          <a href={hashOf({ screen: 'help', param: 'updates' })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
            See One-time updates
          </a>
        </p>
      </Section>
    )
  }
  if (answers.status === 'failed') {
    return (
      <Section title="Was it planned?">
        <p className="text-muted-foreground">Your answers did not load. Reload to try again.</p>
      </Section>
    )
  }
  return (
    <Section title="Was it planned?">
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
      <div role="group" aria-label={`${shop}: planned, impulse or needed`} className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <Button key={c.answer} variant={chosen === c.answer ? 'default' : 'outline'} aria-pressed={chosen === c.answer} onClick={() => void choose(c.answer)}>
            {c.label}
          </Button>
        ))}
      </div>
      {failed ? <p role="alert">That answer wasn’t kept. Try again.</p> : null}
    </li>
  )
}
