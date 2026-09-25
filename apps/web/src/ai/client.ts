/**
 * The app's side of the AI helper (plan §3.2, A09).
 *
 * Every answer, and every way of not getting one, becomes one state with
 * one sentence and at most one Help article to open. A screen never shows
 * a raw error: a helper not deployed yet, a one-time update still to paste,
 * a lost connection and a resting service each read differently, and each
 * says that everything else still works.
 *
 * The helper's replies are the app's own code talking, not a model's, so
 * they are narrowed here by hand rather than parsed with zod, which
 * CLAUDE.md keeps to its four boundaries. Nothing from a reply is ever
 * drawn as markup.
 */
import { AI_CODES, AiProviderSchema, type AiCode, type AiRequest, type AiServiceStatus, type AiStatusReply } from '@budget/schema'
import type { HelpTopic } from '../help/topics.js'
import type { SupabaseClient } from '../supabase.js'

export type AiState =
  | 'on'
  | 'off'
  | 'not_set_up'
  | 'not_deployed'
  | 'needs_update'
  | 'unreachable'
  | 'not_signed_in'
  | 'limit_reached'
  | 'all_resting'
  | 'all_failed'
  | 'key_rejected'
  | 'keys_locked'
  | 'helper_error'

export interface AiView {
  readonly state: AiState
  readonly sentence: string
  /** The Help article that says what to do, when there is something to do. */
  readonly help: HelpTopic | null
  /** What the helper said is set up, when it could say. */
  readonly status: AiStatusReply | null
}

const NAMES: Readonly<Record<AiServiceStatus['provider'], string>> = {
  gemini: 'free Google Gemini',
  groq: 'free Groq',
  openrouter: 'free OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

const SAID: Readonly<Record<Exclude<AiState, 'on'>, { readonly sentence: string; readonly help: HelpTopic | null }>> = {
  off: { sentence: 'AI is off. Everything still works; the Coach uses the app’s own words.', help: null },
  not_set_up: { sentence: 'AI isn’t set up yet. Everything still works in the app’s own words. Turn on free AI in about 2 minutes.', help: 'free-ai' },
  not_deployed: { sentence: 'The AI helper isn’t installed yet. Everything else works. One-time updates shows how.', help: 'updates' },
  needs_update: { sentence: 'AI needs a one-time update. Everything else works. One-time updates shows which.', help: 'updates' },
  unreachable: { sentence: 'Couldn’t reach the AI helper. Check your connection and try again; everything else still works.', help: null },
  not_signed_in: { sentence: 'You’ve been signed out. Sign in again to use AI.', help: null },
  limit_reached: { sentence: 'AI is resting until tomorrow: showing the app’s own words.', help: 'ai-rests' },
  all_resting: { sentence: 'Every AI service is resting for a while: showing the app’s own words.', help: 'ai-rests' },
  all_failed: { sentence: 'The AI services couldn’t answer just now: showing the app’s own words.', help: 'ai-rests' },
  key_rejected: { sentence: 'An AI service turned down its key. Paste it again in AI settings.', help: 'free-ai' },
  keys_locked: { sentence: 'Your saved key can’t be opened after a Supabase key change: paste it again.', help: 'free-ai' },
  helper_error: { sentence: 'The AI helper couldn’t finish that. Everything else works; try again later.', help: 'codes' },
}

/** What each of the helper's codes means for the owner. */
const STATE_OF: Readonly<Record<AiCode, Exclude<AiState, 'on'>>> = {
  not_signed_in: 'not_signed_in',
  origin_not_allowed: 'helper_error',
  method_not_allowed: 'helper_error',
  bad_request: 'helper_error',
  ai_off: 'off',
  not_set_up: 'not_set_up',
  needs_update: 'needs_update',
  limit_reached: 'limit_reached',
  all_resting: 'all_resting',
  all_failed: 'all_failed',
  key_rejected: 'key_rejected',
  keys_locked: 'keys_locked',
  helper_error: 'helper_error',
}

export function viewOf(state: Exclude<AiState, 'on'>, status: AiStatusReply | null = null): AiView {
  return { state, ...SAID[state], status }
}

const isCode = (c: unknown): c is AiCode => AI_CODES.some((k) => k === c)

export type AiAnswer = { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly view: AiView }

/** One request to the helper: its reply, or the state it came to. */
export async function askAi(supabase: SupabaseClient, request: AiRequest): Promise<AiAnswer> {
  const { data, error } = await supabase.functions.invoke('ai', { body: request })
  if (error === null) return { ok: true, data }
  const reply = (error as { context?: unknown }).context
  // No reply at all: the phone is offline, or the request never arrived.
  if (!(reply instanceof Response)) return { ok: false, view: viewOf('unreachable') }
  // Supabase answers a function that was never deployed with its own 404.
  if (reply.status === 404) return { ok: false, view: viewOf('not_deployed') }
  // Supabase's own check of the sign-in answers before the helper can.
  if (reply.status === 401) return { ok: false, view: viewOf('not_signed_in') }
  const body: unknown = await reply.json().catch(() => null)
  const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : null
  return { ok: false, view: viewOf(isCode(code) ? STATE_OF[code] : 'helper_error') }
}

const TIERS: readonly unknown[] = ['free', 'paid']
const SOURCES: readonly unknown[] = ['saved', 'secret', 'none']
const KEY_STATUSES: readonly unknown[] = ['ok', 'busy', 'rejected', 'locked', null]

function serviceOf(v: unknown): AiServiceStatus | null {
  if (typeof v !== 'object' || v === null) return null
  const s = v as Record<string, unknown>
  const provider = AiProviderSchema.safeParse(s['provider'])
  const hint = s['hint']
  if (!provider.success || !TIERS.includes(s['tier']) || !SOURCES.includes(s['source']) || !KEY_STATUSES.includes(s['status'])) return null
  if (typeof s['model'] !== 'string' || (hint !== null && typeof hint !== 'string')) return null
  return {
    provider: provider.data,
    tier: s['tier'] as AiServiceStatus['tier'],
    source: s['source'] as AiServiceStatus['source'],
    hint,
    status: s['status'] as AiServiceStatus['status'],
    model: s['model'],
  }
}

/** A status reply as the helper writes it, or null when it is not one. */
export function statusOf(data: unknown): AiStatusReply | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  const today = d['today'] as Record<string, unknown> | null | undefined
  const services = Array.isArray(d['services']) ? d['services'].map(serviceOf) : []
  if (d['ok'] !== true || typeof d['version'] !== 'string' || services.length === 0 || services.includes(null)) return null
  if (typeof today?.['used'] !== 'number' || typeof today['cap'] !== 'number') return null
  return {
    ok: true,
    version: d['version'],
    enabled: d['enabled'] === true,
    allowPaid: d['allowPaid'] === true,
    services: services.filter((s): s is AiServiceStatus => s !== null),
    today: { used: today['used'], cap: today['cap'] },
  }
}

/**
 * What AI settings says at the top: whether AI is on, and with what. The
 * first service in the helper's list with a key that has not failed its
 * test is the one named; a paid one counts only with paid services on.
 */
export async function aiStatus(supabase: SupabaseClient): Promise<AiView> {
  const answer = await askAi(supabase, { action: 'status' })
  if (!answer.ok) return answer.view
  const status = statusOf(answer.data)
  if (status === null) return viewOf('helper_error')
  if (!status.enabled) return viewOf('off', status)
  const usable = status.services.filter(
    (s) => s.source !== 'none' && (s.tier === 'free' || status.allowPaid) && s.status !== 'rejected' && s.status !== 'locked',
  )
  const first = usable[0]
  if (first === undefined) {
    const locked = status.services.some((s) => s.status === 'locked')
    const rejected = status.services.some((s) => s.status === 'rejected')
    return viewOf(locked ? 'keys_locked' : rejected ? 'key_rejected' : 'not_set_up', status)
  }
  if (status.today.used >= status.today.cap) return viewOf('limit_reached', status)
  const using = first.source === 'secret' ? 'your receipts key' : NAMES[first.provider]
  return { state: 'on', sentence: `AI is on, using ${using}.`, help: null, status }
}
