/**
 * The front door (PLAN §2.3): where an AI app learns to sign in, and the
 * check every request's token passes before any tool runs.
 *
 * Every address here is built from the environment, never from the request,
 * and the token goes to this project's Auth and nowhere else.
 */
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

/** The bearer token in an Authorization header, or null for none or any other form. */
export function bearerOf(header: string | null): string | null {
  return header === null ? null : (/^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(header)?.[1] ?? null)
}
