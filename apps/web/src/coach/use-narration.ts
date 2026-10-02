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
import { parseNarrateReply, type AiProvider } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { aiStatus, askAi, ranOf, REFUSED_VIEW, viewOf, type AiState, type AiView } from '../ai/client.js'
import { readNotes, writeNote } from './ai-cache.js'
import { fromReply, ownWords, reuse, type Day, type Narration, type Signed } from './narration.js'
import { sign, sigsByLetter } from './signatures.js'
import type { SupabaseClient } from '../supabase.js'

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

export function askedHereToday(asOf: string): boolean {
  try {
    return window.localStorage.getItem(ASKED_KEY) === asOf
  } catch {
    // Storage blocked: the notes kept today still say whether today's ask was used.
    return false
  }
}

const WHY_KEY = 'budget.coach.whyOwn'

/** States the helper's status cannot see, because they come of a run: kept for the rest of the day. */
const ONLY_A_RUN_SAYS: readonly AiState[] = ['all_resting', 'all_failed']

function rememberWhy(asOf: string, state: AiState): void {
  try {
    window.localStorage.setItem(WHY_KEY, `${asOf} ${state}`)
  } catch {
    // Storage blocked: a later visit asks the helper's status instead.
  }
}

function rememberedWhy(asOf: string): AiState | null {
  try {
    const [day, state] = (window.localStorage.getItem(WHY_KEY) ?? '').split(' ')
    return day === asOf ? ((state as AiState | undefined) ?? null) : null
  } catch {
    return null
  }
}

/**
 * Why a later visit shows the app's own words, once today's ask found none
 * (the Month and the Coach share one ask a day). What is wrong now wins,
 * from the helper's status, which spends none of the day's calls: a helper
 * installed since is not still "not installed". Only a run can say that
 * every service is resting, so that is kept from the ask.
 */
async function whyOwnWords(supabase: SupabaseClient, asOf: string): Promise<AiView | null> {
  const was = rememberedWhy(asOf)
  if (was === null) return null
  const now = await aiStatus(supabase)
  if (now.state !== 'on') return now
  return ONLY_A_RUN_SAYS.includes(was) ? viewOf(was as Exclude<AiState, 'on'>) : null
}

function markAsked(asOf: string): void {
  try {
    window.localStorage.setItem(ASKED_KEY, asOf)
  } catch {
    // Storage blocked: the helper's own daily limit still bounds the asks.
  }
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
        const view = answer.ok ? REFUSED_VIEW : answer.view
        if (!answer.ok) rememberWhy(asOf, answer.view.state)
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
      const payload = modelPayload({
        tone: day.tone,
        line: day.line?.fact ?? null,
        cards: day.cards,
        goals: day.goals,
        quotes: day.quotes,
        shareShopNames: day.shareShopNames,
      })
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
      if (auto && worth && !askedToday) return ask(day, payload, signed, mine)
      if (!(auto && worth) || kept.provider !== null) return
      const why = await whyOwnWords(supabase, asOf)
      if (mine !== run.current || why === null) return
      setState((s) => (s.status === 'own' ? { ...s, view: why } : s))
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
