/**
 * The owner's AI choices kept in 0016's ai_settings (plan §8.3, A11):
 * whether AI is used at all, the order the services are tried in, whether
 * paid services may be used, and the daily limit. The browser reads and writes its own row; the helper
 * reads the same row through ai_context_for and obeys it.
 *
 * With no row saved yet, the choices are the columns' defaults, so the
 * screen shows what the helper will actually do.
 */
import { AiProviderSchema, type AiProvider } from '@budget/schema'
import { ReadRefused, needsOneTimeUpdate } from '../ledger.js'
import type { SupabaseClient } from '../supabase.js'

export interface AiChoices {
  /** AI on or off (0016's `enabled`): off, the helper answers ai_off and nothing is sent (backend-c2-01). */
  readonly enabled: boolean
  /** Every service, the owner's order first; any a stored order leaves out follow it, as the helper tries them. */
  readonly order: readonly AiProvider[]
  readonly allowPaid: boolean
  readonly dailyCap: number
}

/** 0016's defaults: AI on, free Gemini first, paid off, 40 calls a day. */
export const DEFAULT_CHOICES: AiChoices = { enabled: true, order: AiProviderSchema.options, allowPaid: false, dailyCap: 40 }

/** The daily limits offered, inside 0016's CHECK of 10 to 150. */
export const DAILY_CAPS: readonly number[] = [10, 20, 30, 40, 50, 60, 80, 100, 120, 150]

/** A stored order as the helper reads it: the services it names, once each, then the rest in their usual order. */
export function orderOf(stored: unknown): readonly AiProvider[] {
  const named = (Array.isArray(stored) ? stored : []).flatMap((p) => AiProviderSchema.options.filter((o) => o === p))
  return [...new Set([...named, ...AiProviderSchema.options])]
}

/** The order with one service moved a place earlier (-1) or later (+1); unchanged at either end. */
export function moved(order: readonly AiProvider[], provider: AiProvider, by: -1 | 1): readonly AiProvider[] {
  const from = order.indexOf(provider)
  const to = from + by
  if (from < 0 || to < 0 || to >= order.length) return order
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, provider)
  return next
}

export type ChoicesRead = { readonly ok: true; readonly choices: AiChoices } | { readonly ok: false; readonly why: 'needs_update' | 'unreachable' }

const why = (error: { message: string; code: string }): 'needs_update' | 'unreachable' =>
  needsOneTimeUpdate(new ReadRefused(error.message, error.code)) ? 'needs_update' : 'unreachable'

export async function readChoices(supabase: SupabaseClient, userId: string): Promise<ChoicesRead> {
  const { data, error } = await supabase.from('ai_settings').select('enabled, provider_order, allow_paid, daily_cap').eq('user_id', userId).maybeSingle()
  if (error !== null) return { ok: false, why: why(error) }
  if (data === null) return { ok: true, choices: DEFAULT_CHOICES }
  const row = data as { enabled?: unknown; provider_order?: unknown; allow_paid?: unknown; daily_cap?: unknown }
  return {
    ok: true,
    choices: {
      enabled: row.enabled !== false,
      order: orderOf(row.provider_order),
      allowPaid: row.allow_paid === true,
      dailyCap: typeof row.daily_cap === 'number' ? row.daily_cap : DEFAULT_CHOICES.dailyCap,
    },
  }
}

/** Save the choices in one write, creating the row when there is none. */
export async function saveChoices(supabase: SupabaseClient, userId: string, choices: AiChoices): Promise<true | 'needs_update' | 'unreachable'> {
  const { error } = await supabase
    .from('ai_settings')
    .upsert({ user_id: userId, provider_order: choices.order, allow_paid: choices.allowPaid, daily_cap: choices.dailyCap }, { onConflict: 'user_id' })
  return error === null ? true : why(error)
}

/** Turn AI on or off, writing that column alone, so every other choice stays as it is. */
export async function saveEnabled(supabase: SupabaseClient, userId: string, enabled: boolean): Promise<true | 'needs_update' | 'unreachable'> {
  const { error } = await supabase.from('ai_settings').upsert({ user_id: userId, enabled }, { onConflict: 'user_id' })
  return error === null ? true : why(error)
}
