/**
 * Where the consent page may let an AI app's sign-in send the owner back
 * (PLAN §2.10, ADR 0012): exact callback addresses, not hosts.
 *
 * Anyone can register an OAuth client in this project (dynamic
 * registration is open), name it "Claude" and give it any https callback.
 * Allowing a host would let any page on it receive the code: an open
 * redirect, or a page anyone can publish there. So only the addresses
 * Anthropic and OpenAI document pass, compared after `new URL` has read
 * them, as the browser reads an address it is sent to: the scheme, the
 * host (lower case, one trailing dot ignored) and the path must be exactly
 * one of these, never a prefix, suffix or substring of one. An address
 * carrying a user name, password, query or fragment, even an empty one,
 * passes nothing, and only a program on this computer may name a port.
 * Adding a client's callback is one line here, with its test.
 */

/** Anthropic's documented callback, and the one it says may replace it; ChatGPT's stable callback. */
const EXACT = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
])

/** ChatGPT's per-connection callback, which it uses because Supabase sends no `iss` (K9). */
const CHATGPT_PER_CONNECTION = /^\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/

/** A program on the owner's own computer (desktop tools), on any port and path. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export type Callback =
  /** `local` asks the page to warn that any program on the computer could be listening. */
  | { readonly allowed: true; readonly host: string; readonly local: boolean }
  /** `host` is what the page names in bold; null when the address cannot be read at all. */
  | { readonly allowed: false; readonly host: string | null }

export function checkCallback(address: string): Callback {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return { allowed: false, host: null }
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (host === '') return { allowed: false, host: null }
  // Scheme, host, port and path, and nothing else: the parsed address read back must be exactly those.
  if (url.href !== `${url.protocol}//${url.host}${url.pathname}`) return { allowed: false, host }
  if (url.protocol === 'http:' && LOOPBACK.has(host)) return { allowed: true, host, local: true }
  const exact =
    url.protocol === 'https:' &&
    url.port === '' &&
    (EXACT.has(`https://${host}${url.pathname}`) || (host === 'chatgpt.com' && CHATGPT_PER_CONNECTION.test(url.pathname)))
  return exact ? { allowed: true, host, local: false } : { allowed: false, host }
}
