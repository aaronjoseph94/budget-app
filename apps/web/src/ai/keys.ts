/**
 * Pasting, testing, removing and choosing a model for the free Gemini key
 * (plan §8.3, A10).
 *
 * A key goes one way: it is sent to the helper once, over TLS, and nothing
 * the app keeps or is sent back holds it: at most its last four characters.
 */
import { AI_KEY_SHAPE, type AiKeyReply, type AiModelChoice } from '@budget/schema'
import type { SupabaseClient } from '../supabase.js'
import { askAi, viewOf, type AiView } from './client.js'

/** What the card says after a step: a sentence, whether it went well, and the models to choose from when it did. */
export interface KeyResult {
  readonly sentence: string
  readonly good: boolean
  /** The Help article that says what to do next, when there is one. */
  readonly help: AiView['help']
  readonly models: readonly AiModelChoice[] | null
}

const said = (view: AiView): KeyResult => ({ sentence: view.sentence, good: false, help: view.help, models: null })

/** The helper's key reply as the helper writes it, or null when it is not one. */
function keyReplyOf(data: unknown): AiKeyReply | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  const hint = d['hint']
  const models = Array.isArray(d['models']) ? (d['models'] as unknown[]) : null
  if (d['ok'] !== true || !['ok', 'busy', 'rejected', 'locked'].includes(String(d['status']))) return null
  if (!['saved', 'secret', 'none'].includes(String(d['source'])) || (hint !== null && typeof hint !== 'string')) return null
  const choices = (models ?? []).filter(
    (m): m is AiModelChoice => typeof m === 'object' && m !== null && typeof (m as AiModelChoice).id === 'string' && typeof (m as AiModelChoice).listed === 'boolean',
  )
  if (models === null || choices.length !== models.length) return null
  return { ok: true, provider: 'gemini', source: d['source'] as AiKeyReply['source'], status: d['status'] as AiKeyReply['status'], hint, models: choices }
}

/** The sentences of plan §8.3, for what a test found. */
function resultOf(reply: AiKeyReply): KeyResult {
  const ending = reply.hint === null ? '' : ` ending …${reply.hint}`
  const which = reply.source === 'secret' ? `your receipts key${ending}` : `key${ending}`
  const sentence = {
    ok: `Works · ${which}`,
    busy: 'Busy right now: saved, and it will be tried again',
    rejected: 'Google says this key isn’t valid: check you copied all of it',
    locked: 'Your saved key can’t be opened after a Supabase key change: paste it again',
  }[reply.status]
  return { sentence, good: reply.status === 'ok', help: null, models: reply.status === 'ok' ? reply.models : null }
}

async function keyAsk(supabase: SupabaseClient, request: Parameters<typeof askAi>[1]): Promise<KeyResult> {
  const answer = await askAi(supabase, request)
  if (!answer.ok) return said(answer.view)
  const reply = keyReplyOf(answer.data)
  return reply === null ? said(viewOf('helper_error')) : resultOf(reply)
}

/**
 * Save & test. Spaces around a pasted key are dropped; a key of any other
 * shape is not sent, since the helper would refuse it and the owner would
 * learn nothing.
 */
export async function saveGeminiKey(supabase: SupabaseClient, pasted: string): Promise<KeyResult> {
  const key = pasted.trim()
  if (!AI_KEY_SHAPE.test(key)) {
    return { sentence: 'That doesn’t look like a whole key: check you copied all of it', good: false, help: null, models: null }
  }
  return keyAsk(supabase, { action: 'save_key', provider: 'gemini', key })
}
