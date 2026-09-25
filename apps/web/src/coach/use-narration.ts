/**
 * The Coach's words for today (plan §3.5, §3.8, A12): the app's own first,
 * then the AI's where kept words still fit, then fresh ones when enough of
 * today is uncovered and today's automatic ask is still unused.
 *
 * The brief holds no figure (modelPayload). A reply is parsed at the
 * model-responses boundary (parseNarrateReply), checked against what was
 * offered (checkReply), kept in ai_notes, and only then swapped in. Any
 * way of not getting words leaves the app's own in place, with a reason.
 *
 * At most one ask a day happens by itself: a note already kept for today,
 * from any device, or a mark on this one, means today's has been used.
 * Refresh asks again when today's facts have moved since the last words;
 * the helper's own limit (four daily packs a day) bounds every ask.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { checkReply, modelPayload, type ModelPayload } from '@budget/savings-coach'
import { AiProviderSchema, parseNarrateReply, type AiProvider } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { askAi, type AiView } from '../ai/client.js'
import { readNotes, writeNote } from './ai-cache.js'
import { fromReply, ownWords, reuse, type Day, type Narration, type Signed } from './narration.js'
import { sign, sigsByLetter } from './signatures.js'

export type NarrationStatus = 'loading' | 'own' | 'asking' | 'ai'

export interface NarrationState {
  readonly narration: Narration | null
  readonly status: NarrationStatus
  /** Why the app's own words show, when asking did not work. */
  readonly view: AiView | null
  /** Which service wrote the AI's words shown. */
  readonly provider: AiProvider | null
  /** Today's facts have moved since the last words were kept, and asking again could help. */
  readonly canRefresh: boolean
  readonly refresh: () => void
}

const ASKED_KEY = 'budget.coach.asked'

/** A reply that came back but failed the app's checks as a whole. */
const REFUSED: AiView = { state: 'all_failed', sentence: 'The AI’s words didn’t pass the app’s checks: showing the app’s own words.', help: null, status: null }

export function askedHereToday(asOf: string): boolean {
  try {
    return window.localStorage.getItem(ASKED_KEY) === asOf
  } catch {
    // Storage blocked: the notes kept today still say whether today's ask was used.
    return false
  }
}

function markAsked(asOf: string): void {
  try {
    window.localStorage.setItem(ASKED_KEY, asOf)
  } catch {
    // Storage blocked: the helper's own daily limit still bounds the asks.
  }
}

/** The helper's answer to a run, narrowed by hand: its own code talking, not a model (ai/client.ts). */
function ranOf(data: unknown): { provider: AiProvider; model: string; text: string } | null {
  const d = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  const [provider, model, text] = [AiProviderSchema.safeParse(d['provider']), d['model'], d['text']]
  if (!provider.success || typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(model) || typeof text !== 'string') return null
  return { provider: provider.data, model, text }
}

export function useNarration(day: Day | null, asOf: string, auto: boolean): NarrationState {
  const { supabase, userId } = useAppData()
  const [state, setState] = useState<Omit<NarrationState, 'refresh'>>({ narration: null, status: 'loading', view: null, provider: null, canRefresh: false })
  const brief = useRef<{ payload: ModelPayload; signed: Signed } | null>(null)
  const run = useRef(0)

  const ask = useCallback(
    async (today: Day, payload: ModelPayload, signed: Signed, mine: number) => {
      markAsked(asOf)
      setState((s) => ({ ...s, status: 'asking', canRefresh: false }))
      const answer = await askAi(supabase, { action: 'run', task: 'narrate', pack: 'daily', data: payload.brief })
      if (mine !== run.current) return
      const ran = answer.ok ? ranOf(answer.data) : null
      const parsed = ran === null ? null : parseNarrateReply(ran.text)
      if (ran === null || parsed === null || !parsed.ok) {
        const view = answer.ok ? REFUSED : answer.view
        setState((s) => ({ ...s, status: s.provider === null ? 'own' : 'ai', view }))
        return
      }
      const checked = checkReply({ reply: parsed.reply, brief: payload.brief })
      setState({ narration: fromReply(today, payload, checked.reply), status: 'ai', view: null, provider: ran.provider, canRefresh: false })
      // Kept for reuse; if 0017 is not in, the words still show today, uncached.
      await writeNote(supabase, userId, {
        scope: `day:${asOf}`, factsSig: signed.factsSig, body: checked.reply, cardSigs: sigsByLetter(payload, signed), factKeys: payload.keys,
        provider: ran.provider, model: ran.model,
      })
    },
    [supabase, userId, asOf],
  )

  useEffect(() => {
    if (day === null) return
    const mine = ++run.current
    brief.current = null
    setState({ narration: ownWords(day), status: 'loading', view: null, provider: null, canRefresh: false })
    void (async () => {
      const payload = modelPayload({ tone: day.tone, line: day.line?.fact ?? null, cards: day.cards, goals: day.goals, quotes: day.quotes })
      const signed = await sign(day, payload)
      const read = await readNotes(supabase)
      if (mine !== run.current) return
      brief.current = { payload, signed }
      const notes = read.ok ? read.notes : []
      const kept = reuse(day, signed, notes)
      const askedToday = askedHereToday(asOf) || notes.some((n) => n.scope === `day:${asOf}`)
      const worth = !kept.whole && kept.total > 0 && kept.uncovered * 2 > kept.total
      // Refresh only once words have been kept: with none, there is nothing to be stale.
      const canRefresh = !kept.whole && notes.length > 0
      setState({ narration: kept.narration, status: kept.provider === null ? 'own' : 'ai', view: null, provider: kept.provider, canRefresh })
      if (auto && worth && !askedToday) await ask(day, payload, signed, mine)
    })()
    return () => void ++run.current
  }, [day, asOf, auto, supabase, ask])

  const refresh = useCallback(() => {
    const signedBrief = brief.current
    if (day === null || signedBrief === null) return
    void ask(day, signedBrief.payload, signedBrief.signed, run.current)
  }, [day, ask])

  return { ...state, refresh }
}
