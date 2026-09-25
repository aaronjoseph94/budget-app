/**
 * A month's review in words (plan §2.6, §3.11 feature 10, A15): the app's
 * own first, then the AI's, asked for once for a month that is over and
 * kept in ai_notes (0017) under the month and a signature of its claims.
 *
 * The brief holds no figure (reportBrief). A reply is parsed at the
 * model-responses boundary (parseReportReply), checked against what was
 * offered (checkReportReply), kept, and only then swapped in, part by
 * part: a sentence that fails shows the app's own words in its place. A
 * month so far changes every day, so the AI is never asked about it. Any
 * way of not getting words leaves the app's own in place, with a reason.
 */
import { useEffect, useMemo, useState } from 'react'
import { canonicalJson, checkReportReply, mergeReview, reportBrief, reportFacts, reportWords, type ReportFacts, type Review, type ReviewedMonth } from '@budget/savings-coach'
import { AiProviderSchema, REPORT_PROMPT_VERSION, parseReportReply, type AiProvider, type NarrateReport, type ReportReply } from '@budget/schema'
import { useAppData } from '../app-data.js'
import { askAi, type AiView } from '../ai/client.js'
import { sha256Hex } from '../coach/ai-cache.js'
import { useCoachSettings } from '../coach/settings.js'
import { ranOf } from '../coach/use-narration.js'
import type { SupabaseClient } from '../supabase.js'

export type ReviewStatus = 'so_far' | 'looking' | 'asking' | 'own' | 'ai'
export interface ReviewState {
  readonly facts: ReportFacts
  readonly review: Review
  readonly status: ReviewStatus
  readonly view: AiView | null
  readonly provider: AiProvider | null
}

const ASKED_KEY = 'budget.reports.asked'
const REFUSED: AiView = { state: 'all_failed', sentence: 'The AI’s words didn’t pass the app’s checks: showing the app’s own words.', help: null, status: null }
/** Any number, in any script, or any currency or percent sign: checked words never hold one. */
const FIGURE = /[\p{N}\p{Sc}%％]/u

function askedHere(mark: string): boolean {
  try {
    return window.localStorage.getItem(ASKED_KEY) === mark
  } catch {
    // Storage blocked: the helper's own limit (two reviews a day) still bounds the asks.
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

/** The kept words for this month under this signature, read again as model output; null with none or no 0017. */
async function keptWords(supabase: SupabaseClient, scope: string, sig: string, brief: NarrateReport): Promise<{ reply: ReportReply; provider: AiProvider } | null> {
  const { data, error } = await supabase.from('ai_notes').select('body, provider').eq('surface', 'report').eq('scope', scope).eq('facts_sig', sig).limit(1)
  const row = error === null ? (data as readonly Record<string, unknown>[])[0] : undefined
  if (row === undefined) return null
  const parsed = parseReportReply(row['body'])
  const provider = AiProviderSchema.safeParse(row['provider'])
  if (!parsed.ok || parsed.dropped.length > 0 || !provider.success) return null
  return { reply: checkReportReply({ reply: parsed.reply, brief }).reply, provider: provider.data }
}

export function useReview(report: ReviewedMonth, nameOf: (id: string) => string): ReviewState | null {
  const { supabase, userId } = useAppData()
  const tone = useCoachSettings()?.tone ?? null
  const facts = useMemo(() => reportFacts({ report, nameOf }), [report, nameOf])
  const own = useMemo(() => (tone === null ? null : reportWords({ facts, tone })), [facts, tone])
  const [state, setState] = useState<{ own: object; ai: ReportReply | null; status: ReviewStatus; view: AiView | null; provider: AiProvider | null } | null>(null)

  useEffect(() => {
    if (tone === null || own === null) return
    let live = true
    if (report.status === 'so_far') {
      setState({ own, ai: null, status: 'so_far', view: null, provider: null })
      return
    }
    setState({ own, ai: null, status: 'looking', view: null, provider: null })
    const { brief, keys } = reportBrief({ facts, tone })
    const scope = `month:${report.month.slice(0, 7)}`
    void (async () => {
      const sig = await sha256Hex(`narrate-report/v${REPORT_PROMPT_VERSION}\n${canonicalJson(brief)}`)
      const kept = await keptWords(supabase, scope, sig, brief)
      if (!live) return
      if (kept !== null) return setState({ own, ai: kept.reply, status: 'ai', view: null, provider: kept.provider })
      const mark = `${scope}:${sig}`
      if (askedHere(mark)) return setState({ own, ai: null, status: 'own', view: null, provider: null })
      markAsked(mark)
      setState({ own, ai: null, status: 'asking', view: null, provider: null })
      const answer = await askAi(supabase, { action: 'run', task: 'narrate', pack: 'report', data: brief })
      const ran = answer.ok ? ranOf(answer.data) : null
      const parsed = ran === null ? null : parseReportReply(ran.text)
      if (!live) return
      if (ran === null || parsed === null || !parsed.ok) {
        return setState({ own, ai: null, status: 'own', view: answer.ok ? REFUSED : answer.view, provider: null })
      }
      const checked = checkReportReply({ reply: parsed.reply, brief }).reply
      setState({ own, ai: checked, status: 'ai', view: null, provider: ran.provider })
      // Kept for reuse; if 0017 is not in, the words still show, uncached.
      if (FIGURE.test(JSON.stringify(checked))) return
      await supabase.from('ai_notes').upsert(
        { user_id: userId, surface: 'report', scope, facts_sig: sig, prompt_v: REPORT_PROMPT_VERSION, body: checked, card_sigs: {}, fact_keys: keys, provider: ran.provider, model: ran.model },
        { onConflict: 'user_id,surface,scope,facts_sig', ignoreDuplicates: true },
      )
    })()
    return () => {
      live = false
    }
  }, [report, facts, own, tone, supabase, userId])

  if (own === null || state === null || state.own !== own) return null
  return { facts, review: mergeReview({ own, ai: state.ai }), status: state.status, view: state.view, provider: state.provider }
}
