/**
 * Environment, parsed once at startup.
 *
 * One of the four boundaries CLAUDE.md allows zod to run at. A missing or
 * malformed value fails here, loudly, at load — rather than as an undefined
 * URL somewhere inside a request that then reads as "the network is down".
 *
 * ONLY TWO VALUES ARE PUBLIC: the Supabase URL and the anon key. Both are in
 * every request the browser makes and are meant to be seen; the row-level
 * security policies in the migration are what actually protect the data. The
 * `service_role` key is not here, is not in `VITE_*`, and must never be —
 * it bypasses every one of those policies.
 */
import { z } from 'zod'
import { SECRET_KEY_REFUSED, isSecretKey } from './public-key.js'

// zod's first parse tries `Function('')` to see whether it may compile a
// faster parser. The Content-Security-Policy refuses eval, so every page
// load filed a violation, where a real injection's report would hide among
// them (SEC-NEW-1). The fast path could never run under that policy, so
// nothing is lost. Set here, where the app's first parse is.
z.config({ jitless: true })

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url({ message: 'VITE_SUPABASE_URL must be the project URL' }),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_ANON_KEY looks too short to be a key')
    // A secret or service_role key would give anyone who opens the site's
    // JavaScript the whole database (security-c2-02).
    .refine((key) => !isSecretKey(key), SECRET_KEY_REFUSED),
})

export type Env = z.infer<typeof EnvSchema>

export type EnvOutcome =
  | { readonly ok: true; readonly env: Env }
  | { readonly ok: false; readonly missing: readonly string[] }

/**
 * The two public values, read by name. Vite compiles in only what is named:
 * passing `import.meta.env` whole put every VITE_ variable in the build
 * environment into the bundle, read or not, so a key someone wrongly named
 * VITE_ would have been published (SEC-4). scripts/check-bundle.mjs builds
 * with a probe variable and fails if it ships.
 */
function publicValues(): Record<string, unknown> {
  return {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

/**
 * Reads the build-time environment.
 *
 * Returns an outcome rather than throwing, so an unconfigured build shows a
 * screen explaining what is missing instead of a blank page and a console
 * error. Names the variables and never their values.
 */
export function readEnv(source: Record<string, unknown> = publicValues()): EnvOutcome {
  const parsed = EnvSchema.safeParse(source)
  if (parsed.success) return { ok: true, env: parsed.data }
  return {
    ok: false,
    missing: parsed.error.issues.map((issue) => String(issue.path[0] ?? 'unknown')),
  }
}
