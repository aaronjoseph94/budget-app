/**
 * The front door (PLAN §2.3): where an AI app learns to sign in, and the
 * check every request's token passes before any tool runs.
 *
 * Supabase's OAuth server issues the owner's ordinary JWT with a
 * `client_id` claim. Auth checks the token first (signature, expiry, user
 * and session, so a revoked grant fails at once); only then is its payload
 * read, never trusted before. A token without `client_id` is the owner's
 * own browser sign-in, not an AI app, and is refused: requiring it stands
 * in for the audience Supabase does not bind.
 *
 * Every address here is built from the environment, never from the request,
 * and the token goes to this project's Auth and nowhere else, following no
 * redirect.
 */
import type { AuthInfo } from '@modelcontextprotocol/server'
import { log } from './log.js'

/** Each call to Auth or the database gives up after this long (PLAN §2.7). */
export const CALL_TIMEOUT_MS = 10_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Which check refused a token, as the number the log carries. */
const CHECK = { auth: 1, user: 2, payload: 3, iss: 4, role: 5, sub: 6, client_id: 7 } as const

export type Project = { readonly url: string; readonly anonKey: string }

export const resourceOf = (p: Project) => `${p.url}/functions/v1/mcp`
export const metadataUrlOf = (p: Project) => `${resourceOf(p)}/.well-known/oauth-protected-resource`

/**
 * RFC 9728's metadata. `resource` is the address the owner pastes, and there
 * is one authorization server (Claude uses the first). No custom scope is
 * advertised: Supabase refuses a sign-in that asks for one.
 */
export function protectedResource(p: Project) {
  return {
    resource: resourceOf(p),
    authorization_servers: [`${p.url}/auth/v1`],
    scopes_supported: ['email'],
    bearer_methods_supported: ['header'],
  }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/**
 * The 401 that tells a client where to sign in: Supabase cannot serve
 * `/.well-known` at the project's root, so this header is how every client
 * finds it. Never 403 for a bad token: Claude treats that as final.
 */
export function challenge(p: Project, tokenSent: boolean): Response {
  const invalid = tokenSent ? ', error="invalid_token"' : ''
  return json(401, { error: tokenSent ? 'invalid_token' : 'unauthorized' }, {
    'WWW-Authenticate': `Bearer resource_metadata="${metadataUrlOf(p)}", scope="email"${invalid}`,
  })
}

/**
 * The bearer token in an Authorization header, or null for none or any
 * other form. The scheme is read in any letter case, as RFC 7235 §2.1 has
 * it: 'bearer <token>' was refused as an invalid token (testing mcp-06).
 */
export function bearerOf(header: string | null): string | null {
  return header === null ? null : (/^Bearer ([A-Za-z0-9._~+/=-]+)$/i.exec(header)?.[1] ?? null)
}

function refuse(p: Project, check: keyof typeof CHECK): Response {
  log('token_refused', { check: CHECK[check] })
  return challenge(p, true)
}

function claimsOf(token: string): Record<string, unknown> | null {
  try {
    const part = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')
    const claims: unknown = JSON.parse(atob(part))
    return typeof claims === 'object' && claims !== null && !Array.isArray(claims) ? (claims as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** The caller, as the SDK passes it to the tools, or the response that refuses it. */
export async function checkToken(p: Project, header: string | null, fetchFn: typeof fetch): Promise<AuthInfo | Response> {
  const token = bearerOf(header)
  if (token === null) return challenge(p, header !== null)

  let res: Response
  try {
    res = await fetchFn(`${p.url}/auth/v1/user`, {
      method: 'GET',
      headers: { apikey: p.anonKey, Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    })
  } catch {
    log('auth_unreachable')
    return json(503, { error: 'auth_unreachable' })
  }
  // Auth's body is never read on a refusal, logged, or passed on.
  if (res.status === 401 || res.status === 403) return refuse(p, 'auth')
  if (!res.ok) {
    log('auth_status', { status: res.status })
    return json(503, { error: 'auth_unreachable' })
  }
  const user: unknown = await res.json().catch(() => null)
  const id = typeof user === 'object' && user !== null && 'id' in user ? user.id : null
  if (typeof id !== 'string' || !UUID.test(id)) return refuse(p, 'user')

  const claims = claimsOf(token)
  if (claims === null) return refuse(p, 'payload')
  if (claims.iss !== `${p.url}/auth/v1`) return refuse(p, 'iss')
  if (claims.role !== 'authenticated') return refuse(p, 'role')
  if (typeof claims.sub !== 'string' || claims.sub.toLowerCase() !== id.toLowerCase()) return refuse(p, 'sub')
  const clientId = claims.client_id
  if (typeof clientId !== 'string' || !UUID.test(clientId)) {
    log('token_refused', { check: CHECK.client_id })
    return json(403, {
      error: 'not_an_ai_app',
      message: 'This address is for AI apps connected through the budget app, not for the app itself.',
    })
  }
  return { token, clientId: clientId.toLowerCase(), scopes: [], extra: { user: id.toLowerCase() } }
}
