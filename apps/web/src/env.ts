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

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url({ message: 'VITE_SUPABASE_URL must be the project URL' }),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_ANON_KEY looks too short to be a key'),
})

export type Env = z.infer<typeof EnvSchema>

export type EnvOutcome =
  | { readonly ok: true; readonly env: Env }
  | { readonly ok: false; readonly missing: readonly string[] }

/**
 * Reads the build-time environment.
 *
 * Returns an outcome rather than throwing, so an unconfigured build shows a
 * screen explaining what is missing instead of a blank page and a console
 * error. Names the variables and never their values.
 */
export function readEnv(source: Record<string, unknown> = import.meta.env): EnvOutcome {
  const parsed = EnvSchema.safeParse(source)
  if (parsed.success) return { ok: true, env: parsed.data }
  return {
    ok: false,
    missing: parsed.error.issues.map((issue) => String(issue.path[0] ?? 'unknown')),
  }
}
