/**
 * The one Supabase client.
 *
 * Created from parsed environment, so nothing here has to defend against an
 * undefined URL. Everything it reads and writes is already constrained by the
 * row-level security policies in supabase/migrations — the client sends the
 * signed-in user's token and the database decides what that user may see.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './env.js'
import { watchNetwork } from './offline.js'

/**
 * Where the client keeps the session on this device: Supabase's own default
 * name, written out so sign-out can remove it when the client will not
 * (security-a-06). Naming the same key signs no one out.
 */
export function sessionKeyOf(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0] ?? ''}-auth-token`
}

/** A note, for the sign-in screen after a reload, that only this device was signed out. */
export const SIGNED_OUT_HERE_ONLY = 'budget.signed-out-here-only'

export function createSupabase(env: Env): SupabaseClient {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      // The session is restored from storage and refreshed in the background,
      // so a magic link is clicked once rather than every visit.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // A sign-in link carries a one-time code, which only the browser that
      // asked for it can exchange, not the tokens themselves in the address
      // bar, as the implicit flow sent them (SEC-5). So a link opens only in
      // the browser it was asked from; sign-in says so.
      flowType: 'pkce',
      storageKey: sessionKeyOf(env.VITE_SUPABASE_URL),
    },
    // Watched so a request that gets no reply says "offline" once, above
    // the screen, rather than only as each screen's own failure (A26).
    global: { fetch: watchNetwork((input, init) => fetch(input, init)) },
  })
}

export type { SupabaseClient }
