import type { ReactNode } from 'react'
import type { AiProvider } from '@budget/schema'
import { hashOf } from '../nav.js'
import { Button } from '../components/ui/button.js'
import type { NarrationState } from './use-narration.js'

const BY: Readonly<Record<AiProvider, string>> = {
  gemini: 'free Google Gemini',
  groq: 'free Groq',
  openrouter: 'free OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

const link = 'inline-flex min-h-11 items-center font-medium underline underline-offset-4'

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
  if (status === 'loading') said = 'Looking for today’s AI words. The app’s own show meanwhile.'
  else if (status === 'asking') said = 'Asking the AI for today’s words. The app’s own show meanwhile.'
  else if (status === 'ai' && provider !== null) said = `✨ Words by AI (${BY[provider]}) from your numbers. Every figure is the app’s own.`
  else if (view?.state === 'not_set_up' || view?.state === 'off') {
    said = (
      <>
        The app’s own words.{' '}
        <a href={hashOf({ screen: 'ai', param: null })} className={link}>
          {view.state === 'off' ? 'Turn AI back on' : 'Turn on free AI (2 minutes)'}
        </a>
      </>
    )
  } else if (view !== null) {
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
  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <p aria-live="polite" className="min-w-0 flex-1 text-xs text-muted-foreground">
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
