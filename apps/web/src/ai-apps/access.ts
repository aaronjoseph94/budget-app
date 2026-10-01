/**
 * Settings → AI apps (PLAN §2.9, ADR 0012): the owner's switch, whether AI
 * apps may add to Review, and the window Connect a new AI app opens, kept
 * in 0020's ai_app_access. The browser reads and writes its own row through
 * row-level security; an AI app's token cannot write it (0020's restrictive
 * policies), so an AI app can never switch itself on or open its own window.
 *
 * With no row saved, AI apps are off: 0020's own default.
 */
import { ReadRefused, needsOneTimeUpdate } from '../ledger.js'
import type { SupabaseClient } from '../supabase.js'

export interface Access {
  readonly enabled: boolean
  readonly allowAdd: boolean
  /** Until when the consent page may allow a new connection, as stored; null when never opened. */
  readonly connectUntil: string | null
}

export const NO_ACCESS: Access = { enabled: false, allowAdd: true, connectUntil: null }

export type Why = 'needs_update' | 'unreachable'
export type AccessRead = { readonly ok: true; readonly access: Access } | { readonly ok: false; readonly why: Why }

const why = (error: { message: string; code: string }): Why =>
  needsOneTimeUpdate(new ReadRefused(error.message, error.code)) ? 'needs_update' : 'unreachable'

export async function readAccess(supabase: SupabaseClient, userId: string): Promise<AccessRead> {
  const { data, error } = await supabase.from('ai_app_access').select('enabled, allow_add, connect_until').eq('user_id', userId).maybeSingle()
  if (error !== null) return { ok: false, why: why(error) }
  if (data === null) return { ok: true, access: NO_ACCESS }
  const row = data as { enabled?: unknown; allow_add?: unknown; connect_until?: unknown }
  return {
    ok: true,
    access: { enabled: row.enabled === true, allowAdd: row.allow_add !== false, connectUntil: typeof row.connect_until === 'string' ? row.connect_until : null },
  }
}

/**
 * Save what changed, creating the row when there is none. The browser's
 * time zone goes with every save, so "today" for the daily limits follows
 * where the owner last used Settings (PLAN risk 17); 0020 refuses a zone
 * Postgres does not know.
 */
export async function saveAccess(
  supabase: SupabaseClient,
  userId: string,
  change: { readonly enabled?: boolean; readonly allowAdd?: boolean },
): Promise<true | Why> {
  const row = {
    user_id: userId,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(change.enabled === undefined ? {} : { enabled: change.enabled }),
    ...(change.allowAdd === undefined ? {} : { allow_add: change.allowAdd }),
  }
  const { error } = await supabase.from('ai_app_access').upsert(row, { onConflict: 'user_id' })
  return error === null ? true : why(error)
}
