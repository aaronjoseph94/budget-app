/**
 * The month in review, in words (plan §2.6, A15): a headline, three points
 * and one thing to try, the AI's (✨) where they passed the app's checks
 * and the app's own everywhere else. Every figure in them is a blank filled
 * from core's monthReport as it is drawn; the words are drawn as text,
 * never markup.
 */
import type { ReactNode } from 'react'
import type { ReviewedMonth } from '@budget/savings-coach'
import { Section } from '../forecast/parts.js'
import { AiMark, CoachText } from '../coach/words.js'
import { useReview, type ReviewState } from './use-review.js'
import { LineLink } from '../ai/LineLink.js'
import { PROVIDER_NAME } from '../ai/client.js'

/** Whose words these are, and why the app's own show when the AI's do not. */
function Whose({ state }: { state: ReviewState }) {
  const { status, view, provider } = state
  let said: ReactNode = 'In the app’s own words, from your records.'
  if (status === 'so_far') said = 'The app’s own words until the month is over.'
  else if (status === 'looking') said = 'Looking for this month’s AI words.'
  else if (status === 'asking') said = 'Asking the AI to review this month.'
  else if (status === 'ai' && provider !== null) said = `✨ Words by ${PROVIDER_NAME[provider]}; figures by the app.`
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

export function ReviewCard({ report, nameOf }: { report: ReviewedMonth; nameOf: (id: string) => string }) {
  const state = useReview(report, nameOf)
  if (state === null) return null
  const { review, facts } = state
  return (
    // Mockup A tints the review to the accent, the one tinted card on the
    // screen; its muted words take canvas-muted there (ADR 0010).
    <Section title="The month in review" large className="bg-linear-to-br from-card to-primary-tint [--muted-foreground:var(--canvas-muted)]">
      <div aria-live="polite" className="space-y-3">
        <p className="text-lg font-medium leading-snug [overflow-wrap:anywhere]">
          <AiMark ai={review.headline.ai} />
          <CoachText text={review.headline.text} facts={facts.facts} />
        </p>
        <ul className="list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
          {review.points.map((p) => (
            <li key={p.fact}>
              <AiMark ai={p.ai} />
              <CoachText text={p.text} facts={facts.facts} />
            </li>
          ))}
        </ul>
        <p className="[overflow-wrap:anywhere]">
          <span className="font-medium">One thing to try: </span>
          <AiMark ai={review.tryThis.ai} />
          <CoachText text={review.tryThis.text} facts={facts.facts} />
        </p>
      </div>
      <Whose state={state} />
    </Section>
  )
}
