import type { ReactNode } from 'react'
import type { Answer, AnswerLine } from '@budget/core'
import { ANSWER_WORDS, ASK_CATALOGUE, type AskRead } from '@budget/savings-coach'
import { formatDateRange, formatDayMonth, formatMonthTitle } from '../format.js'
import { hashOf, type Screen } from '../nav.js'
import { Card, CardContent } from '../components/ui/card.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { CoachText, figureText, type Named } from '../coach/words.js'
import type { ReadBy } from './read.js'

const link = 'inline-flex min-h-11 items-center font-medium underline underline-offset-4'

/** "Coffee", "Coffee and Groceries", "Coffee, Groceries and Dining out". */
export function namesOf(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

const named = (line: AnswerLine): Named => ({ subject: { label: namesOf(line.names) }, figures: line.figures })

/** One line of an answer, in the app's own words, each blank filled with core's figure. */
export function LineText({ line, under }: { line: AnswerLine; under?: AnswerLine | undefined }) {
  return <CoachText text={ANSWER_WORDS[line.say].text} facts={under === undefined ? { A: named(line) } : { A: named(line), B: named(under) }} />
}

const PERIOD_WORDS: Readonly<Record<string, string>> = {
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  last_month: 'Last month',
  this_year: 'This year',
  last_year: 'Last year',
  last_three_months: 'The last three months',
}

/** "I read that as": what was asked, about what, and when, in the owner's words. */
export function ReadAs({ read, by, names, answer }: { read: Extract<AskRead, { kind: 'intent' }>; by: ReadBy; names: readonly string[]; answer: Answer | null }) {
  const p = read.period
  const days = answer?.status === 'answered' ? answer.now : null
  const when =
    p === null
      ? null
      : p.kind !== 'month'
        ? PERIOD_WORDS[p.kind]
        : days !== null
          ? formatMonthTitle(days.from)
          : `${p.month.charAt(0).toUpperCase()}${p.month.slice(1)}${p.year === 'last' ? ' last year' : ''}`
  const parts = [ASK_CATALOGUE[read.intent].label, ...(names.length === 0 ? [] : [namesOf(names)]), ...(when === null ? [] : [when])]
  return (
    <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
      {by.by === 'ai' ? (
        <>
          <span aria-hidden="true">✨ </span>
          <span className="sr-only">Read by AI. </span>
        </>
      ) : null}
      I read that as: {parts.join(' · ')}
    </p>
  )
}

/** Where the whole of an answer is shown, as a link. */
function Onward({ read, answer }: { read: Extract<AskRead, { kind: 'intent' }>; answer: Answer }) {
  const screen = ASK_CATALOGUE[read.intent].screen
  const month = answer.status === 'answered' && answer.now !== null ? answer.now.from.slice(0, 7) : null
  const to: Readonly<Record<Exclude<typeof screen, 'help'>, readonly [Screen, string | null, string]>> = {
    month: ['month', month, 'See it on the Month'],
    week: ['week', null, 'Open the Week'],
    reports: ['reports', month, 'Open Reports'],
    forecast: ['forecast', null, 'Open the Forecast'],
    savings: ['savings', null, 'Open Savings'],
    debts: ['debts', null, 'Open Debts'],
  }
  if (screen === 'help') return null
  const [target, param, words] = to[screen]
  return (
    <a href={hashOf({ screen: target, param })} className={link}>
      {words}
    </a>
  )
}

/** Why there is no answer, in one line, with the one place that helps. */
function NoAnswer({ answer, missingUpdate }: { answer: Exclude<Answer, { status: 'answered' }>; missingUpdate: boolean }): ReactNode {
  switch (answer.status) {
    case 'not_yet':
      return <p>That month hasn’t come yet.</p>
    case 'before_records':
      return answer.coveredFrom === null ? (
        <p>There are no records yet. Bring in a statement on Add, and ask again.</p>
      ) : (
        <p>Your records here start on {formatDayMonth(answer.coveredFrom)}, so there is nothing before then to count.</p>
      )
    case 'missing':
      return missingUpdate ? (
        <p>
          {answer.what === 'forecast' ? 'The forecast' : 'Your payoff plan'} needs a one-time update.{' '}
          <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
            See One-time updates
          </a>
        </p>
      ) : (
        <p>{answer.what === 'forecast' ? 'The forecast' : 'Your payoff plan'} did not load. Try again in a moment.</p>
      )
  }
}

/** The answer card: what was read, the figure, the sentence, the list under it and where to see the whole. */
export function AnswerCard(props: {
  read: Extract<AskRead, { kind: 'intent' }>
  by: ReadBy
  names: readonly string[]
  answer: Answer
  missingUpdate: boolean
  /** The editable amount, for a what-if. */
  children?: ReactNode
}) {
  const { read, answer } = props
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <ReadAs read={read} by={props.by} names={props.names} answer={answer} />
        {answer.status === 'answered' ? <Answered answer={answer} /> : <NoAnswer answer={answer} missingUpdate={props.missingUpdate} />}
        {props.children}
        <Onward read={read} answer={answer} />
      </CardContent>
    </Card>
  )
}

function Answered({ answer }: { answer: Extract<Answer, { status: 'answered' }> }) {
  const { main, rows, now, before, cutFrom } = answer
  const lead = ANSWER_WORDS[main.say].lead
  const figure = lead === null ? undefined : main.figures[lead]
  // A what-if's one row only names its goal for the sentence; it is not a list.
  const listed = rows.filter((r) => r.say !== 'goal')
  return (
    <>
      {figure === undefined ? null : <p className="tnum text-3xl font-bold [overflow-wrap:anywhere]">{figureText(figure)}</p>}
      <p className="text-base leading-snug [overflow-wrap:anywhere]">
        <LineText line={main} under={rows[0]} />
      </p>
      {now === null ? null : (
        <p className="text-sm text-muted-foreground">
          {formatDateRange(now.from, now.to)}
          {before === null ? '' : `, against ${formatDateRange(before.from, before.to)}`}
        </p>
      )}
      {cutFrom === null ? null : <p className="text-sm text-muted-foreground">Your records start on {formatDayMonth(cutFrom)}, so this counts from then.</p>}
      {listed.length === 0 ? null : (
        <ul className="divide-y text-sm">
          {listed.map((line, i) => (
            <li key={i} className="py-2 [overflow-wrap:anywhere]">
              <LineText line={line} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
