/**
 * When Review asks the AI for categories, and what it came to (plan §2.8,
 * A21; ADR 0008).
 *
 * **Suggest categories** asks on a tap. It is also asked by itself, once
 * each time Review opens, when AI is on and some row waiting has never
 * been asked about on this device: rows arrive only by an import, so that
 * is "after an import" without the import screen having to say so. The
 * rows asked about are remembered in the browser only, in try/catch; with
 * storage blocked it may ask again, and the helper's six a day bound it.
 *
 * 0018 is checked before the AI is asked, so a missing update never spends
 * a free call, and Share shop names off means nothing is sent at all.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { categoriseBatches, type CategoriseInput } from '@budget/savings-coach'
import { useAppData } from '../app-data.js'
import { aiStatus } from '../ai/client.js'
import { readCoachSettings } from '../ai/coach-settings.js'
import { suggestCategories, suggestionsReady, type Stopped } from './suggestions.js'

export type SuggestStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'asking' }
  | { readonly kind: 'done'; readonly suggested: number; readonly stopped: Stopped | null }
  | { readonly kind: 'missing' }
  | { readonly kind: 'no_shop_names' }

const ASKED_KEY = 'budget.review.suggest-asked'
/** Enough for a few statements; the oldest are forgotten first. */
const KEEP = 1_000

function askedHere(): ReadonlySet<string> {
  try {
    const kept: unknown = JSON.parse(window.localStorage.getItem(ASKED_KEY) ?? '[]')
    return new Set(Array.isArray(kept) ? kept.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function markAsked(ids: readonly string[]): void {
  try {
    const kept = [...askedHere(), ...ids]
    window.localStorage.setItem(ASKED_KEY, JSON.stringify([...new Set(kept)].slice(-KEEP)))
  } catch {
    // Storage blocked: the helper's own limit still bounds the asks.
  }
}

/** `input` is Review's queue as it stands; `reload` reads it again once suggestions are stored. */
export function useSuggestions(input: CategoriseInput | null, reload: () => Promise<void>) {
  const { supabase, userId } = useAppData()
  const [status, setStatus] = useState<SuggestStatus>({ kind: 'idle' })
  const tried = useRef(false)
  // Every row a tap would ask about, by the same rule the batches use (F46).
  const waiting = useMemo(
    () => (input === null ? [] : categoriseBatches(input).batches.flatMap((b) => Object.values(b.rows).flat())),
    [input],
  )

  const run = useCallback(async () => {
    if (input === null) return
    setStatus({ kind: 'asking' })
    markAsked(waiting)
    if ((await suggestionsReady(supabase)) === 'missing') return setStatus({ kind: 'missing' })
    const settings = await readCoachSettings(supabase, userId)
    if (settings.ok && !settings.settings.shareShopNames) return setStatus({ kind: 'no_shop_names' })
    const result = await suggestCategories(supabase, input)
    setStatus({ kind: 'done', ...result })
    if (result.suggested > 0) await reload()
  }, [input, waiting, supabase, userId, reload])

  // Once a visit, and only for rows never asked about here, and only with AI on.
  useEffect(() => {
    if (input === null || tried.current) return
    tried.current = true
    const asked = askedHere()
    if (waiting.length === 0 || waiting.every((id) => asked.has(id))) return
    void aiStatus(supabase).then((view) => {
      if (view.state === 'on') void run()
    })
  }, [input, waiting, supabase, run])

  return { status, waiting: waiting.length, suggest: () => void run() }
}
