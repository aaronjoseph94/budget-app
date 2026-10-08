import type { ReactNode } from 'react'
import { hashOf } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { LineLink } from '../ai/LineLink.js'
import type { NarrationState } from './use-narration.js'
import { PROVIDER_NAME } from '../ai/client.js'

/**
 * One line under the Coach's title saying whose words these are (plan
 * §2.3): the AI's, and which service wrote them; the app's own, and why
 * when asking did not work, with the one place that fixes it; or that the
 * AI is being asked. It is a polite live region, so the words arriving
 * late are announced once, not every card over again. Refresh shows only
 * when today's facts have moved since the last words were kept.
 */
export function CoachStatus({ state }: { state: NarrationState }) {
  const { status, view, provider } = state
  let said: ReactNode = 'In the app’s own words, from your records.'
  if (status === 'loading') said = 'Looking for today’s AI words.'
  else if (status === 'asking') said = 'Asking the AI for today’s words.'
  else if (status === 'ai' && provider !== null) said = `✨ Words by ${PROVIDER_NAME[provider]}; figures by the app.`
  else if (view?.state === 'not_set_up' || view?.state === 'off') {
    said = (
      <>
        The app’s own words.{' '}
        <a href={hashOf({ screen: 'settings', param: 'ai' })} className={SENTENCE_LINK}>
          {view.state === 'off' ? 'Turn AI back on' : 'Turn on free AI (2 minutes)'}
        </a>
      </>
    )
  } else if (view !== null) {
    said = (
      <>
        {view.sentence}{' '}
        <LineLink view={view} />
      </>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <p aria-live="polite" className="min-w-0 flex-1 text-xs text-muted-foreground md:text-sm">
        {said}
      </p>
      {state.canRefresh ? (
        <Button size="sm" variant="outline" onClick={state.refresh}>
          Refresh the AI’s words
        </Button>
      ) : null}
    </div>
  )
}
