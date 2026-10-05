import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoredSuggestion } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { readConnectedApps } from '../ai-apps/access.js'
import { IngestedText } from '../ui.js'
import { Card } from '../components/ui/card.js'
import { Alert, Badge } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { cn } from '../lib/cn.js'
import { applySuggestion, dismissSuggestion } from './apply-suggestion.js'
import { cardWords, valueWords, type CardWords, type Words } from './change-words.js'
import { currentOf, listWaiting, readSources, stateOf, type CardState, type Waiting } from './suggested-changes.js'

/** One card: its suggestion as read, its state, and its words. */
export interface Shown {
  readonly id: string
  readonly suggestion: StoredSuggestion | null
  readonly state: CardState
  readonly words: CardWords | null
  /** What its target is now, in words; null when it cannot be read or is gone. */
  readonly now: Words | null
  /** The AI app that suggested it, by its grant's name. */
  readonly app: string
}

/** Each waiting row as a card, from fresh rows. */
async function readCards(supabase: Parameters<typeof listWaiting>[0], categories: Parameters<typeof readSources>[1]): Promise<readonly Shown[]> {
  const waiting = await listWaiting(supabase)
  if (waiting.length === 0) return []
  const parsed = waiting.flatMap((w) => (w.suggestion === null ? [] : [w.suggestion]))
  const [sources, apps] = await Promise.all([readSources(supabase, categories, parsed), readConnectedApps(supabase)])
  const names = new Map(apps.ok ? apps.apps.map((a) => [a.clientId, a.name]) : [])
  return waiting.map((w: Waiting) => {
    const s = w.suggestion
    const now = s === null ? null : currentOf(s, sources)
    return {
      id: w.id,
      suggestion: s,
      state: stateOf(s, now),
      words: s === null ? null : cardWords(s, sources),
      now: s === null || now === null || 'gone' in now ? null : valueWords(s, now.value, sources),
      app: names.get(w.clientId ?? '') ?? 'An AI app',
    }
  })
}

/** Words as drawn: names and shops as ingested text, never markup. */
export function Drawn({ words }: { words: Words }) {
  return words.map((w, i) => (typeof w === 'string' ? w : <IngestedText key={i}>{w.data}</IngestedText>))
}

const DONE = {
  applied: 'Applied. Your budget shows the change.',
  already: 'That is already so, so nothing was changed.',
  stale: 'That changed since it was suggested, so nothing was changed. Dismiss it, or ask the AI app again.',
} as const

/**
 * Suggested changes, at the top of Review (ADR 0013): what a connected AI
 * app suggested, each with its reason, the change as "from → to" worked
 * out fresh, Apply and Dismiss. Nothing changes until Apply. Hidden when
 * none wait, and before 0039 is in.
 */
export function SuggestedChanges() {
  const { supabase, userId, categories, refresh, version } = useAppData()
  const [shown, setShown] = useState<readonly Shown[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reads = useRef(0)
  const said = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const read = ++reads.current
    try {
      const cards = await readCards(supabase, categories)
      if (read === reads.current) setShown(cards)
    } catch (cause) {
      if (read === reads.current) setError(cause instanceof Error ? cause.message : 'Could not load the suggested changes.')
    }
  }, [supabase, categories])

  useEffect(() => {
    void load()
  }, [load, version])

  const act = async (item: Shown, what: 'apply' | 'dismiss') => {
    setBusy(item.id)
    setNote(null)
    setError(null)
    let done = false
    try {
      if (what === 'dismiss' || item.suggestion === null) {
        await dismissSuggestion(supabase, item.id)
        setNote('Dismissed. Nothing was changed.')
      } else {
        setNote(DONE[await applySuggestion(supabase, userId, item.suggestion)])
      }
      done = true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Nothing was changed.')
    } finally {
      setBusy(null)
    }
    // As Review's rows: a read already out would draw the card again (CR-13).
    if (done) {
      reads.current += 1
      await refresh()
    }
    said.current?.focus()
  }

  if (shown.length === 0 && error === null) return null
  return (
    <section aria-labelledby="suggested-title" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="suggested-title" className="text-lg font-semibold">
          Suggested changes
        </h2>
        {shown.length > 0 ? <Badge variant="accent">{shown.length}</Badge> : null}
      </div>
      <p className="text-sm text-muted-foreground">An AI app you connected suggested these. Nothing changes until you tap Apply.</p>
      <div ref={said} tabIndex={-1} className="space-y-3 outline-none empty:hidden">
        {note !== null ? <Alert tone="success">{note}</Alert> : null}
        {error !== null ? <Alert tone="error" title="That did not work">{error}</Alert> : null}
      </div>
      <ul className="space-y-3">
        {shown.map((item) => (
          <SuggestionCard key={item.id} item={item} busy={busy !== null} onAct={(what) => void act(item, what)} />
        ))}
      </ul>
    </section>
  )
}

/** One suggestion: what it changes, from what to what, the AI app's reason, and what can be done. */
export function SuggestionCard({ item, busy, onAct }: { item: Shown; busy: boolean; onAct: (what: 'apply' | 'dismiss') => void }) {
  const { words, state } = item
  const change = words?.change ?? null
  return (
    <li>
      <Card className={cn('p-4 md:px-5', busy && 'opacity-60')}>
        {words === null ? (
          <p className="font-semibold">This suggestion can’t be read.</p>
        ) : (
          <>
            <p className="font-semibold [overflow-wrap:anywhere]">
              <Drawn words={words.title} />
            </p>
            {change !== null ? (
              <p className="mt-1 [overflow-wrap:anywhere]">
                <Drawn words={state === 'ready' && item.now !== null ? item.now : change.from} /> → <Drawn words={change.to} />
              </p>
            ) : null}
            {words.note !== null ? <p className="mt-1 text-sm text-muted-foreground">{words.note}</p> : null}
          </>
        )}
        {item.suggestion !== null ? (
          <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {item.app}’s reason: <IngestedText>{item.suggestion.reason}</IngestedText>
          </p>
        ) : null}
        {state === 'stale' ? (
          <p className="mt-2 text-sm font-medium">
            Changed since it was suggested{item.now === null ? ', and no longer there' : <>: now <Drawn words={item.now} /></>}.
          </p>
        ) : state === 'already' ? (
          <p className="mt-2 text-sm font-medium">Already so.</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {state === 'ready' ? (
            <Button disabled={busy} onClick={() => onAct('apply')}>
              Apply
            </Button>
          ) : null}
          <Button variant="outline" disabled={busy} onClick={() => onAct('dismiss')}>
            {state === 'already' ? 'Clear' : 'Dismiss'}
          </Button>
        </div>
      </Card>
    </li>
  )
}
