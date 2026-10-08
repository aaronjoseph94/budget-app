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

/**
 * What PostgREST answers when it turns down the sign-in pass itself, before
 * any SQL runs: one it cannot read (PGRST301), or one whose times it will
 * not accept (PGRST303). Nothing was read or written, so asking again is safe.
 */
const REFUSED_PASS = new Set(['PGRST301', 'PGRST303'])

/** How long to wait before asking again: Supabase's API can refuse a pass for a moment after issuing it. */
export const REFUSED_PASS_WAIT_MS = 1000

/**
 * One more try, a moment later, with the pass the client holds then, for a
 * read or write whose pass PostgREST refused. Supabase's API refused passes
 * a moment after a renewal (its stale time cache, Aug to Sep 2026; still
 * seen here on 2026-10-08): one of four reads sent together failed and the
 * Week said "Could not load your data". Its advice was to wait and try
 * again. Only once: a pass refused twice is shown as it is.
 */
export function retryRefusedPass(inner: typeof fetch, currentPass: () => Promise<string | null>, waitMs: number): typeof fetch {
  return async (input, init) => {
    const reply = await inner(input, init)
    if (reply.status !== 401 || input instanceof Request || !String(input).includes('/rest/v1/')) return reply
    const answer: unknown = await reply
      .clone()
      .json()
      .catch(() => null)
    const code = typeof answer === 'object' && answer !== null && 'code' in answer ? answer.code : null
    if (typeof code !== 'string' || !REFUSED_PASS.has(code)) return reply
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    const pass = await currentPass()
    if (pass === null) return reply
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${pass}`)
    return inner(input, { ...init, headers })
  }
}

export function createSupabase(env: Env, { refusedPassWaitMs = REFUSED_PASS_WAIT_MS } = {}): SupabaseClient {
  // The client is made below, so the retry reads it late, once a pass is refused.
  let made: SupabaseClient | null = null
  const currentPass = async () => (made === null ? null : ((await made.auth.getSession()).data.session?.access_token ?? null))
  const send: typeof fetch = (input, init) => fetch(input, init)
  made = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
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
    global: { fetch: watchNetwork(retryRefusedPass(send, currentPass, refusedPassWaitMs)) },
  })
  return made
}

export type { SupabaseClient }
