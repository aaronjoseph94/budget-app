/**
 * Review's suggested categories, the app's side (plan §2.8, §3.9, A21;
 * ADR 0008).
 *
 * savings-coach chooses the rows to ask about and batches them; the AI
 * helper's `categorise` task answers each batch; the reply is parsed at the
 * model-responses boundary (parseCategoriseReply), which keeps only a row
 * sent, an alias offered and medium or high confidence; and what is kept is
 * stored by 0018's suggest_candidate_categories as the model's, on rows
 * still waiting. Nothing here approves anything: the owner still taps
 * Approve, and approve_candidate records the choice as the owner's.
 *
 * Every way of not getting suggestions is a reason the screen can say in
 * one line, and Review works as before without them.
 */
import { categoriseBatches, suggestionsOf, type CategoriseInput } from '@budget/savings-coach'
import { parseCategoriseReply } from '@budget/schema'
import { askAi, ranOf, type AiView } from '../ai/client.js'
import type { SupabaseClient } from '../supabase.js'

/** PostgREST's "no such function" and Postgres's: 0018 not pasted yet. */
const NOT_THERE: ReadonlySet<string> = new Set(['PGRST202', '42883'])
/** 0018 takes at most this many at once; a shop seen often can stand for more rows than that. */
const PER_CALL = 200

export type Stopped = { readonly kind: 'ai'; readonly view: AiView } | { readonly kind: 'needs_update' } | { readonly kind: 'failed' }

export interface SuggestResult {
  /** Rows given a suggestion, as 0018 counted them. */
  readonly suggested: number
  /** Why it stopped before the last batch, or null when every batch was asked. */
  readonly stopped: Stopped | null
}

/** Whether 0018 is in, asked with no suggestions, which changes nothing. */
export async function suggestionsReady(supabase: SupabaseClient): Promise<'in' | 'missing' | 'unknown'> {
  const { error } = await supabase.rpc('suggest_candidate_categories', { p: [] })
  if (error === null) return 'in'
  return NOT_THERE.has(error.code) ? 'missing' : 'unknown'
}

/**
 * Ask about every row that needs it, a batch at a time, storing each
 * batch's suggestions before asking the next, so a limit reached halfway
 * keeps what was already suggested. A reply that does not parse leaves its
 * rows as they were and the next batch is still asked.
 */
export async function suggestCategories(supabase: SupabaseClient, input: CategoriseInput): Promise<SuggestResult> {
  let suggested = 0
  for (const batch of categoriseBatches(input).batches) {
    const answer = await askAi(supabase, { action: 'run', task: 'categorise', data: batch.brief })
    if (!answer.ok) return { suggested, stopped: { kind: 'ai', view: answer.view } }
    const ran = ranOf(answer.data)
    const parsed = ran === null ? null : parseCategoriseReply(ran.text, batch.brief)
    if (parsed === null || !parsed.ok) continue
    const proposals = suggestionsOf({ batch, picks: parsed.picks })
    for (let from = 0; from < proposals.length; from += PER_CALL) {
      const { data, error } = await supabase.rpc('suggest_candidate_categories', { p: proposals.slice(from, from + PER_CALL) })
      if (error !== null) return { suggested, stopped: NOT_THERE.has(error.code) ? { kind: 'needs_update' } : { kind: 'failed' } }
      if (typeof data === 'number') suggested += data
    }
  }
  return { suggested, stopped: null }
}
