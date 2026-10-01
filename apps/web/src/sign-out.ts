/**
 * Sign out, and leave nothing signed in on this device (security-a-06).
 *
 * auth-js keeps the session when sign-out cannot refresh an expired token
 * (offline after a long gap): the tap did nothing and said nothing. Then
 * the stored session and its PKCE verifier are removed here and the page
 * reloads to the sign-in screen, which says other devices may still be
 * signed in, since the server never heard. The recent Ask questions, kept
 * on this device for whoever is signed in, go either way.
 */
import { forgetQuestions } from './ask/recent.js'
import { readEnv } from './env.js'
import { SIGNED_OUT_HERE_ONLY, sessionKeyOf, type SupabaseClient } from './supabase.js'

interface Here {
  readonly key: string | null
  readonly reload: () => void
}

function here(): Here {
  const env = readEnv()
  return { key: env.ok ? sessionKeyOf(env.env.VITE_SUPABASE_URL) : null, reload: () => window.location.reload() }
}

export async function signOutHere(supabase: SupabaseClient, device: Here = here()): Promise<void> {
  forgetQuestions()
  const { error } = await supabase.auth.signOut()
  if (error === null) return
  try {
    if (device.key !== null) {
      localStorage.removeItem(device.key)
      localStorage.removeItem(`${device.key}-code-verifier`)
    }
    sessionStorage.setItem(SIGNED_OUT_HERE_ONLY, '1')
  } catch {
    // Storage refused: nothing was kept to remove.
  }
  device.reload()
}
