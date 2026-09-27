import type { ReactNode } from 'react'
import { hashOf } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import type { Stopped } from './suggestions.js'
import type { SuggestStatus } from './use-suggestions.js'

const link = 'inline-flex min-h-11 items-center font-medium underline underline-offset-4'
const UPDATES = hashOf({ screen: 'help', param: 'updates' })

function Updates({ children }: { children: string }) {
  return (
    <>
      {children}{' '}
      <a href={UPDATES} className={link}>
        See One-time updates
      </a>
    </>
  )
}

/** Why asking stopped, as Review can say it in one line. */
function stopLine(stopped: Stopped): ReactNode {
  const missing = stopped.kind === 'needs_update' || (stopped.kind === 'ai' && (stopped.view.state === 'not_deployed' || stopped.view.state === 'needs_update'))
  if (missing) return <Updates>Suggested categories need a one-time update.</Updates>
  return stopped.kind === 'ai' ? 'The AI couldn’t suggest categories just now.' : 'Couldn’t keep the suggestions just now. Try again.'
}

function said(status: SuggestStatus): ReactNode {
  switch (status.kind) {
    case 'idle':
      return null
    case 'asking':
      return '✨ Asking the AI to suggest categories…'
    case 'missing':
      return stopLine({ kind: 'needs_update' })
    case 'no_shop_names':
      return (
        <>
          Suggestions are off while Share shop names is off.{' '}
          <a href={hashOf({ screen: 'ai', param: null })} className={link}>
            AI settings
          </a>
        </>
      )
    case 'done': {
      const got =
        status.suggested === 0
          ? status.stopped === null
            ? 'The AI had no suggestion it was sure of. Pick each category yourself.'
            : null
          : `✨ Suggested a category for ${status.suggested === 1 ? '1 row' : `${status.suggested} rows`}. Check each before you approve it.`
      const stop = status.stopped === null ? null : stopLine(status.stopped)
      return (
        <>
          {got}
          {got !== null && stop !== null ? ' ' : null}
          {stop}
        </>
      )
    }
  }
}

/**
 * Review's one line about suggested categories, and the button that asks
 * for them (plan §2.8, A21). Whatever happens here, the queue below works
 * as it always has: this line is the only thing a missing update, a missing
 * helper or a resting AI changes.
 */
export function SuggestBar({ status, waiting, onSuggest }: { status: SuggestStatus; waiting: number; onSuggest: () => void }) {
  const line = said(status)
  const offer = waiting > 0 && status.kind !== 'asking' && status.kind !== 'missing' && status.kind !== 'no_shop_names'
  if (line === null && !offer) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p aria-live="polite" className="min-w-0 flex-1 text-sm text-muted-foreground">
        {line}
      </p>
      {offer ? (
        <Button variant="outline" className="min-h-11" onClick={onSuggest}>
          <Icon name="sparkles" /> Suggest categories
        </Button>
      ) : null}
    </div>
  )
}
