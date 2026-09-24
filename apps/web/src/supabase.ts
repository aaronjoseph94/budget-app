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
    },
  })
}

export type { SupabaseClient }
