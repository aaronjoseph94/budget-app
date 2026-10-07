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
import { currentOf, listWaiting, readSources, staleWhy, stateOf, type CardState, type Waiting } from './suggested-changes.js'

/** One card: its suggestion as read, its state, and its words. */
export interface Shown {
  readonly id: string
  readonly suggestion: StoredSuggestion | null
  readonly state: CardState
  readonly words: CardWords | null
  /** What its target is now, in words; null when it cannot be read or is gone. */
  readonly now: Words | null
  /** Why it is stale when not because its value moved; null otherwise. */
  readonly why: string | null
  /** The AI app that suggested it, by its grant's name. */
  readonly app: string
}

/** Each waiting row as a card, from fresh rows. */
async function readCards(supabase: Parameters<typeof listWaiting>[0], categories: Parameters<typeof readSources>[1], today: string): Promise<readonly Shown[]> {
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
      state: stateOf(s, now, today),
      words: s === null ? null : cardWords(s, sources),
      now: s === null || now === null || 'gone' in now ? null : valueWords(s, now.value, sources),
      why: staleWhy(s, now, today),
      app: names.get(w.clientId ?? '') ?? 'An AI app',
    }
  })
}

/** Words as drawn: names and shops as ingested text, never markup. */
export function Drawn({ words }: { words: Words }) {
  return words.map((w, i) => (typeof w === 'string' ? w : <IngestedText key={i}>{w.data}</IngestedText>))
}

/** `busy` while Apply all works through its cards: every card waits. */
const ALL = '__all__'

const DONE = {
  applied: 'Applied. Your budget shows the change.',
  already: 'That is already so, so nothing was changed.',
  stale: 'That changed since it was suggested, so nothing was changed. Dismiss it, or ask the AI app again.',
  gone: 'That suggestion was already decided, replaced or expired, so nothing was changed.',
  applied_unmarked:
    'Your budget shows the change, but the suggestion stopped waiting just before (decided elsewhere, replaced or expired), so look over any newer card.',
  applied_mark_failed: 'Your budget shows the change, but the suggestion could not be marked applied, so its card may stay as “Already so”: press Clear.',
} as const

/**
 * Suggested changes, at the top of Review (ADR 0013): what a connected AI
 * app suggested, each with its reason, the change as "from → to" worked
 * out fresh, Apply and Dismiss. Nothing changes until Apply. Hidden when
 * none wait, and before 0039 is in.
 */
export function SuggestedChanges() {
  const { supabase, userId, categories, refresh, version, today } = useAppData()
  const [shown, setShown] = useState<readonly Shown[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A read's own failure, apart from an action's: the next read that works
  // takes it away, and leaves an action's error alone (skills-06).
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const reads = useRef(0)
  const said = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const read = ++reads.current
    try {
      const cards = await readCards(supabase, categories, today)
      if (read !== reads.current) return
      setShown(cards)
      setLoadError(null)
    } catch (cause) {
      if (read === reads.current) setLoadError(cause instanceof Error ? cause.message : 'Could not load the suggested changes.')
    }
  }, [supabase, categories, today])

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
        // False when it no longer waited: applied on another device,
        // replaced or expired, never "Dismissed" (skills-04).
        setNote((await dismissSuggestion(supabase, item.id)) ? 'Dismissed. Nothing was changed.' : DONE.gone)
      } else {
        setNote(DONE[await applySuggestion(supabase, userId, item.suggestion, today)])
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

  // Apply all: every ready card but a shop rule, which lasts and is applied one at a time.
  const all = shown.flatMap((item) => (item.state === 'ready' && item.suggestion !== null && item.suggestion.kind !== 'learn_shop' ? [{ item, s: item.suggestion }] : []))
  const applyAll = async () => {
    setBusy(ALL)
    setNote(null)
    setError(null)
    let applied = 0
    let unmarked = 0
    let problem: string | null = null
    // One at a time, oldest first; one stale, gone or refused is not
    // applied and the rest go on. A change made whose mark was refused was
    // still made.
    for (const { s } of all) {
      try {
        const done = await applySuggestion(supabase, userId, s, today)
        if (done === 'applied' || done === 'applied_unmarked' || done === 'applied_mark_failed') applied += 1
        else if (done === 'gone') problem ??= DONE.gone
        if (done === 'applied_mark_failed') unmarked += 1
      } catch (cause) {
        problem ??= cause instanceof Error ? cause.message : 'That did not work.'
      }
    }
    setNote(`Applied ${applied} of ${all.length}.${unmarked === 0 ? '' : ` ${unmarked} could not be marked applied, so ${unmarked === 1 ? 'its card may stay' : 'their cards may stay'} as “Already so”: press Clear.`}`)
    if (applied < all.length) setError(`${all.length - applied} not applied${problem === null ? ': each card still waiting says why.' : `. ${problem}`}`)
    setBusy(null)
    setConfirming(false)
    reads.current += 1
    await refresh()
    said.current?.focus()
  }

  if (shown.length === 0 && error === null && loadError === null) return null
  return (
    <section aria-labelledby="suggested-title" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="suggested-title" className="text-lg font-semibold">
          Suggested changes
        </h2>
        {shown.length > 0 ? <Badge variant="accent">{shown.length}</Badge> : null}
        {all.length >= 2 && !confirming ? (
          <Button variant="outline" className="ml-auto" disabled={busy !== null} onClick={() => setConfirming(true)}>
            Apply all {all.length}
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">An AI app you connected suggested these. Nothing changes until you tap Apply.</p>
      {confirming && all.length > 0 ? (
        <Card className="p-4 md:px-5" role="group" aria-labelledby="apply-all-title">
          <h3 id="apply-all-title" className="font-medium">
            Apply {all.length} suggested changes?
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">Each changes your budget as its card says. Shop rules are applied one at a time.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy !== null} onClick={() => void applyAll()}>
              Apply all {all.length}
            </Button>
            <Button variant="outline" disabled={busy !== null} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
      <div ref={said} tabIndex={-1} className="space-y-3 outline-none empty:hidden">
        {note !== null ? <Alert tone="success">{note}</Alert> : null}
        {error !== null ? <Alert tone="error" title="That did not work">{error}</Alert> : null}
        {loadError !== null ? <Alert tone="error" title="That did not work">{loadError}</Alert> : null}
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
            {item.why ?? (
              <>
                Changed since it was suggested: now <Drawn words={item.now ?? []} />.
              </>
            )}
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
