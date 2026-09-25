/**
 * The month in review, in words (plan §2.6, A15): a headline, three points
 * and one thing to try, the AI's (✨) where they passed the app's checks
 * and the app's own everywhere else. Every figure in them is a blank filled
 * from core's monthReport as it is drawn; the words are drawn as text,
 * never markup.
 */
import type { ReactNode } from 'react'
import type { ReviewedMonth } from '@budget/savings-coach'
import type { AiProvider } from '@budget/schema'
import { hashOf } from '../nav.js'
import { Section } from '../forecast/parts.js'
import { CoachText } from '../coach/words.js'
import { useReview, type ReviewState } from './use-review.js'

const BY: Readonly<Record<AiProvider, string>> = {
  gemini: 'free Google Gemini',
  groq: 'free Groq',
  openrouter: 'free OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

const link = 'inline-flex min-h-11 items-center font-medium underline underline-offset-4'

/** The AI's mark, said as words to a screen reader. */
function Mark({ ai }: { ai: boolean }) {
  if (!ai) return null
  return (
    <>
      <span aria-hidden="true">✨ </span>
      <span className="sr-only">Written by AI: </span>
    </>
  )
}

/** Whose words these are, and why the app's own show when the AI's do not. */
function Whose({ state }: { state: ReviewState }) {
  const { status, view, provider } = state
  let said: ReactNode = 'In the app’s own words, from your records.'
  if (status === 'so_far') said = 'In the app’s own words. The AI reviews a month once it is over.'
  else if (status === 'looking') said = 'Looking for this month’s AI words. The app’s own show meanwhile.'
  else if (status === 'asking') said = 'Asking the AI to review this month. The app’s own words show meanwhile.'
  else if (status === 'ai' && provider !== null) said = `✨ Words by AI (${BY[provider]}) from your numbers. Every figure is the app’s own.`
  else if (view !== null) {
    said = (
      <>
        {view.sentence}{' '}
        {view.help === null ? null : (
          <a href={hashOf({ screen: 'help', param: view.help })} className={link}>
            {view.help === 'updates' ? 'Help: One-time updates' : 'Why?'}
          </a>
        )}
      </>
    )
  }
  return <p className="text-xs text-muted-foreground">{said}</p>
}

export function ReviewCard({ report, nameOf }: { report: ReviewedMonth; nameOf: (id: string) => string }) {
  const state = useReview(report, nameOf)
  if (state === null) return null
  const { review, facts } = state
  return (
    <Section title="The month in review">
      <div aria-live="polite" className="space-y-3">
        <p className="text-lg font-medium leading-snug [overflow-wrap:anywhere]">
          <Mark ai={review.headline.ai} />
          <CoachText text={review.headline.text} facts={facts.facts} />
        </p>
        <ul className="list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
          {review.points.map((p) => (
            <li key={p.fact}>
              <Mark ai={p.ai} />
              <CoachText text={p.text} facts={facts.facts} />
            </li>
          ))}
        </ul>
        <p className="[overflow-wrap:anywhere]">
          <span className="font-medium">One thing to try: </span>
          <Mark ai={review.tryThis.ai} />
          <CoachText text={review.tryThis.text} facts={facts.facts} />
        </p>
      </div>
      <Whose state={state} />
    </Section>
  )
}
