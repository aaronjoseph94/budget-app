/**
 * The check-in's words (plan §2.4, §3.11 feature 7, A20): the app's own
 * first, then the AI's, asked for at most once a week on a device and kept
 * in ai_notes (0017) under the week and a signature of its claims.
 *
 * The brief holds no figure (checkinBrief). A reply is parsed at the
 * model-responses boundary (parseCheckinReply), checked against what was
 * offered (checkCheckinReply), kept, and only then swapped in, part by
 * part: a sentence that fails shows the app's own words in its place. Any
 * way of not getting words leaves the app's own in place, with a reason.
 */
import { useEffect, useMemo, useState } from 'react'
import { canonicalJson, checkCheckinReply, checkinBrief, checkinWords, mergeCheckin, type Checkin, type CheckinFacts } from '@budget/savings-coach'
import { AiProviderSchema, CHECKIN_PROMPT_VERSION, parseCheckinReply, type AiProvider, type CheckinReply, type NarrateCheckin } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { askAi, type AiView } from '../ai/client.js'
import type { SupabaseClient } from '../supabase.js'
import { sha256Hex } from './ai-cache.js'
import { useCoachSettings } from './settings.js'
import { ranOf } from './use-narration.js'

export type CheckinWordsStatus = 'looking' | 'asking' | 'own' | 'ai'
export interface CheckinWordsState {
  readonly checkin: Checkin
  readonly status: CheckinWordsStatus
  readonly view: AiView | null
  readonly provider: AiProvider | null
}

const ASKED_KEY = 'budget.coach.checkin.asked'
const REFUSED: AiView = { state: 'all_failed', sentence: 'The AI’s words didn’t pass the app’s checks: showing the app’s own words.', help: null, status: null }
/** Any number, in any script, or any currency or percent sign: checked words never hold one. */
const FIGURE = /[\p{N}\p{Sc}%％]/u

function askedHere(mark: string): boolean {
  try {
    return window.localStorage.getItem(ASKED_KEY) === mark
  } catch {
    // Storage blocked: the helper's own limit (two check-ins a day) still bounds the asks.
    return false
  }
}

function markAsked(mark: string): void {
  try {
    window.localStorage.setItem(ASKED_KEY, mark)
  } catch {
    // As above.
  }
}

/** The kept words for this week under this signature, read again as model output; null with none or no 0017. */
async function keptWords(supabase: SupabaseClient, scope: string, sig: string, brief: NarrateCheckin): Promise<{ reply: CheckinReply; provider: AiProvider } | null> {
  const { data, error } = await supabase.from('ai_notes').select('body, provider').eq('surface', 'checkin').eq('scope', scope).eq('facts_sig', sig).limit(1)
  const row = error === null ? (data as readonly Record<string, unknown>[])[0] : undefined
  if (row === undefined) return null
  const parsed = parseCheckinReply(row['body'])
  const provider = AiProviderSchema.safeParse(row['provider'])
  if (!parsed.ok || parsed.dropped.length > 0 || !provider.success) return null
  return { reply: checkCheckinReply({ reply: parsed.reply, brief }).reply, provider: provider.data }
}

/** `facts` should hold still while the screen is open, or each change would be a new ask. */
export function useCheckinWords(facts: CheckinFacts | null, week: string | null): CheckinWordsState | null {
  const { supabase, userId } = useAppData()
  const tone = useCoachSettings()?.tone ?? null
  const own = useMemo(() => (facts === null || tone === null ? null : checkinWords({ facts, tone })), [facts, tone])
  const [state, setState] = useState<{ own: object; ai: CheckinReply | null; status: CheckinWordsStatus; view: AiView | null; provider: AiProvider | null } | null>(null)

  useEffect(() => {
    if (facts === null || tone === null || own === null || week === null) return
    let live = true
    setState({ own, ai: null, status: 'looking', view: null, provider: null })
    const { brief, keys } = checkinBrief({ facts, tone })
    const scope = `week:${week}`
    void (async () => {
      const sig = await sha256Hex(`narrate-checkin/v${CHECKIN_PROMPT_VERSION}\n${canonicalJson(brief)}`)
      const kept = await keptWords(supabase, scope, sig, brief)
      if (!live) return
      if (kept !== null) return setState({ own, ai: kept.reply, status: 'ai', view: null, provider: kept.provider })
      const mark = `${scope}:${sig}`
      if (askedHere(mark)) return setState({ own, ai: null, status: 'own', view: null, provider: null })
      markAsked(mark)
      setState({ own, ai: null, status: 'asking', view: null, provider: null })
      const answer = await askAi(supabase, { action: 'run', task: 'narrate', pack: 'checkin', data: brief })
      const ran = answer.ok ? ranOf(answer.data) : null
      const parsed = ran === null ? null : parseCheckinReply(ran.text)
      if (!live) return
      if (ran === null || parsed === null || !parsed.ok) {
        return setState({ own, ai: null, status: 'own', view: answer.ok ? REFUSED : answer.view, provider: null })
      }
      const checked = checkCheckinReply({ reply: parsed.reply, brief }).reply
      setState({ own, ai: checked, status: 'ai', view: null, provider: ran.provider })
      // Kept for reuse; if 0017 is not in, the words still show, uncached.
      if (FIGURE.test(JSON.stringify(checked))) return
      await supabase.from('ai_notes').upsert(
        { user_id: userId, surface: 'checkin', scope, facts_sig: sig, prompt_v: CHECKIN_PROMPT_VERSION, body: checked, card_sigs: {}, fact_keys: keys, provider: ran.provider, model: ran.model },
        { onConflict: 'user_id,surface,scope,facts_sig', ignoreDuplicates: true },
      )
    })()
    return () => {
      live = false
    }
  }, [facts, own, tone, week, supabase, userId])

  if (own === null || state === null || state.own !== own) return null
  return { checkin: mergeCheckin({ own, ai: state.ai }), status: state.status, view: state.view, provider: state.provider }
}
