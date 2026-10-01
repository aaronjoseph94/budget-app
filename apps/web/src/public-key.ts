/**
 * The one check that the public key is public (security-c2-02).
 *
 * The browser may hold only the publishable key (or the legacy anon key).
 * A secret key (`sb_secret_…`) or the legacy `service_role` key bypasses
 * every row-level security policy, and Vite compiles VITE_SUPABASE_ANON_KEY
 * into the published JavaScript, where anyone can read it. Supabase's API
 * Keys page shows them side by side, so a wrong paste is one click away.
 * Used by env.ts, so a dev server shows Not configured, and by
 * vite.config.ts, so `vite build` stops before anything is written.
 *
 * A denylist, not an allowlist of the publishable form: the bundle gate's
 * placeholder and the tests' made-up values must still pass.
 */

/** The JSON payload of a three-part token, or null when it is not one. */
function tokenPayload(value: string): unknown {
  const parts = value.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as unknown
  } catch {
    return undefined
  }
}

/** Whether a value is a key that must never reach the browser. */
export function isSecretKey(value: string): boolean {
  if (value.startsWith('sb_secret_')) return true
  const payload = tokenPayload(value)
  if (payload === null) return false
  // A token that cannot be read, or whose role is not anon, is refused.
  return typeof payload !== 'object' || payload === null || (payload as { role?: unknown }).role !== 'anon'
}

export const SECRET_KEY_REFUSED =
  'VITE_SUPABASE_ANON_KEY is a secret or service_role key, which bypasses every access rule. Use the publishable key.'

/** For the build: throws, naming the variable and never its value. A missing key is left to the app's Not configured. */
export function refuseSecretKey(env: Readonly<Record<string, string | undefined>>): void {
  const key = env['VITE_SUPABASE_ANON_KEY']
  if (key !== undefined && isSecretKey(key)) throw new Error(SECRET_KEY_REFUSED)
}
