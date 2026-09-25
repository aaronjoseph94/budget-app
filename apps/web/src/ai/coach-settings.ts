/**
 * How the Coach talks, kept in 0016's ai_settings (plan §2.3, §3.6, A12):
 * its tone, Cheerleader or Straight talker, which the app's own words and
 * the AI's brief both follow; and whether shop names may be sent to the
 * AI. The browser reads and writes its own row, beside the choices A11
 * keeps there (choices.ts); each write names only its own columns, so
 * neither undoes the other.
 *
 * With no row saved, or 0016 not pasted yet, the Coach is a Cheerleader
 * and shop names are shared: 0016's own defaults, so the screen and the
 * Coach say what the database would.
 */
import type { Tone } from '@budget/savings-coach'
import { ReadRefused, needsOneTimeUpdate } from '../ledger.js'
import type { SupabaseClient } from '../supabase.js'

export interface CoachSettings {
  readonly tone: Tone
  readonly shareShopNames: boolean
}

export const DEFAULT_COACH: CoachSettings = { tone: 'cheerleader', shareShopNames: true }

export type CoachSettingsRead = { readonly ok: true; readonly settings: CoachSettings } | { readonly ok: false; readonly why: 'needs_update' | 'unreachable' }

const why = (error: { message: string; code: string }): 'needs_update' | 'unreachable' =>
  needsOneTimeUpdate(new ReadRefused(error.message, error.code)) ? 'needs_update' : 'unreachable'

export async function readCoachSettings(supabase: SupabaseClient, userId: string): Promise<CoachSettingsRead> {
  const { data, error } = await supabase.from('ai_settings').select('tone, share_shop_names').eq('user_id', userId).maybeSingle()
  if (error !== null) return { ok: false, why: why(error) }
  if (data === null) return { ok: true, settings: DEFAULT_COACH }
  const row = data as { tone?: unknown; share_shop_names?: unknown }
  return {
    ok: true,
    settings: { tone: row.tone === 'straight' ? 'straight' : 'cheerleader', shareShopNames: row.share_shop_names !== false },
  }
}

/** Save both in one write, creating the row when there is none. */
export async function saveCoachSettings(supabase: SupabaseClient, userId: string, settings: CoachSettings): Promise<true | 'needs_update' | 'unreachable'> {
  const { error } = await supabase
    .from('ai_settings')
    .upsert({ user_id: userId, tone: settings.tone, share_shop_names: settings.shareShopNames }, { onConflict: 'user_id' })
  return error === null ? true : why(error)
}
