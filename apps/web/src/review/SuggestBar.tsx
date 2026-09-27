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

const AI = hashOf({ screen: 'ai', param: null })

/**
 * Why asking stopped, as Review can say it in one line, with the one place
 * that fixes it. The Coach's sentences talk about its own words, so Review
 * has its own.
 */
function stopLine(stopped: Stopped): ReactNode {
  if (stopped.kind === 'needs_update') return <Updates>Suggested categories need a one-time update.</Updates>
  if (stopped.kind === 'failed') return 'Couldn’t keep the suggestions just now. Try again.'
  const { view } = stopped
  switch (view.state) {
    case 'not_deployed':
    case 'needs_update':
      return <Updates>Suggested categories need a one-time update.</Updates>
    case 'helper_error':
      return <Updates>The AI helper couldn’t suggest categories. If it was pasted before 27 September, it needs its new copy.</Updates>
    case 'not_set_up':
    case 'off':
      return (
        <>
          {view.state === 'off' ? 'AI is off, so nothing is suggested.' : 'Turn on free AI to have categories suggested.'}{' '}
          <a href={AI} className={link}>
            {view.state === 'off' ? 'Turn AI back on' : 'Turn on free AI (2 minutes)'}
          </a>
        </>
      )
    case 'limit_reached':
    case 'all_resting':
    case 'all_failed':
      return (
        <>
          The AI is resting. Try Suggest categories again later.{' '}
          <a href={hashOf({ screen: 'help', param: 'ai-rests' })} className={link}>
            Why?
          </a>
        </>
      )
    default:
      return view.sentence
  }
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
          <a href={AI} className={link}>
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
