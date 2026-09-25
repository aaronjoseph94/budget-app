/**
 * Pasting, testing, removing and choosing a model for any AI service's key
 * (plan §8.3, A10 and A11).
 *
 * A key goes one way: it is sent to the helper once, over TLS, and nothing
 * the app keeps or is sent back holds it: at most its last four characters.
 * Removing one is 0016's `ai_key_forget`, which deletes only the caller's
 * own key; the browser has no grant on the table itself.
 */
import { AI_KEY_SHAPE, AiProviderSchema, type AiKeyReply, type AiModelChoice, type AiProvider } from '@budget/schema'
import { ReadRefused, needsOneTimeUpdate } from '../ledger.js'
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
  const provider = AiProviderSchema.options.find((p) => p === d['provider'])
  if (d['ok'] !== true || provider === undefined || !['ok', 'busy', 'rejected', 'locked'].includes(String(d['status']))) return null
  if (!['saved', 'secret', 'none'].includes(String(d['source'])) || (hint !== null && typeof hint !== 'string')) return null
  const choices = (models ?? []).filter(
    (m): m is AiModelChoice => typeof m === 'object' && m !== null && typeof (m as AiModelChoice).id === 'string' && typeof (m as AiModelChoice).listed === 'boolean',
  )
  if (models === null || choices.length !== models.length) return null
  return { ok: true, provider, source: d['source'] as AiKeyReply['source'], status: d['status'] as AiKeyReply['status'], hint, models: choices }
}

/** Who gives out each service's keys, as the owner knows them. */
export const COMPANY: Readonly<Record<AiProvider, string>> = {
  gemini: 'Google',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

/** The sentences of plan §8.3, for what a test found. */
function resultOf(reply: AiKeyReply): KeyResult {
  const ending = reply.hint === null ? '' : ` ending …${reply.hint}`
  const which = reply.source === 'secret' ? `your receipts key${ending}` : `key${ending}`
  const sentence = {
    ok: `Works · ${which}`,
    busy: 'Busy right now: saved, and it will be tried again',
    rejected: `${COMPANY[reply.provider]} says this key isn’t valid: check you copied all of it`,
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
export async function saveKey(supabase: SupabaseClient, provider: AiProvider, pasted: string): Promise<KeyResult> {
  const key = pasted.trim()
  if (!AI_KEY_SHAPE.test(key)) {
    return { sentence: 'That doesn’t look like a whole key: check you copied all of it', good: false, help: null, models: null }
  }
  return keyAsk(supabase, { action: 'save_key', provider, key })
}

/** Check which models work: tests the key the helper would use, the pasted one or, for Gemini, the receipts secret. */
export function testKey(supabase: SupabaseClient, provider: AiProvider): Promise<KeyResult> {
  return keyAsk(supabase, { action: 'test_key', provider })
}

/** Remove key: true when it is gone; a sentence when it could not be. */
export async function forgetKey(supabase: SupabaseClient, provider: AiProvider): Promise<true | KeyResult> {
  const { error } = await supabase.rpc('ai_key_forget', { p_provider: provider })
  if (error === null) return true
  if (needsOneTimeUpdate(new ReadRefused(error.message, error.code))) return said(viewOf('needs_update'))
  return { sentence: 'Couldn’t remove the key just now. Check your connection and try again.', good: false, help: null, models: null }
}

/**
 * The model the owner chose, kept in 0016's ai_settings beside every other
 * service's choice. The helper still checks it against its own list, so a
 * choice is only ever a name, never an address.
 */
export async function chooseModel(supabase: SupabaseClient, userId: string, provider: AiProvider, model: string): Promise<boolean> {
  const read = await supabase.from('ai_settings').select('models').eq('user_id', userId).maybeSingle()
  if (read.error !== null) return false
  const had: unknown = (read.data as { models?: unknown } | null)?.models
  const models = typeof had === 'object' && had !== null && !Array.isArray(had) ? had : {}
  const { error } = await supabase.from('ai_settings').upsert({ user_id: userId, models: { ...models, [provider]: model } }, { onConflict: 'user_id' })
  return error === null
}
