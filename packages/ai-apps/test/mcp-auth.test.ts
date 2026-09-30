import { describe, expect, it } from 'vitest'
import { handle } from '../src/handle.js'

/**
 * The front door (PLAN §2.3, §2.13 mcp-auth): the metadata, and the 401 that
 * points to it, each answered before anything else is asked.
 */

const PROJECT = 'https://project.supabase.co'
const ENV = { SUPABASE_URL: PROJECT, SUPABASE_ANON_KEY: 'anon-key-for-tests' }
const RESOURCE = `${PROJECT}/functions/v1/mcp`
const METADATA = `${RESOURCE}/.well-known/oauth-protected-resource`

function call(auth: string | null) {
  return handle(
    new Request(`${PROJECT}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth === null ? {} : { authorization: auth }) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
    ENV,
  )
}

describe('discovery', () => {
  it('serves the metadata with no token, naming the one authorization server', async () => {
    const res = await handle(new Request(`${PROJECT}/mcp/.well-known/oauth-protected-resource`), ENV)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      resource: RESOURCE,
      authorization_servers: [`${PROJECT}/auth/v1`],
      scopes_supported: ['email'],
      bearer_methods_supported: ['header'],
    })
  })

  it('builds it from the environment, never from the request', async () => {
    const res = await handle(new Request('https://evil.example/mcp/.well-known/oauth-protected-resource'), ENV)
    expect(((await res.json()) as { resource: string }).resource).toBe(RESOURCE)
  })

  it('answers only GET there', async () => {
    expect((await handle(new Request(METADATA, { method: 'POST' }), ENV)).status).toBe(405)
  })
})

describe('the challenge', () => {
  it('answers no token with 401 and the exact metadata address', async () => {
    const res = await call(null)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${METADATA}", scope="email"`)
  })

  it.each(['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer a b'])('answers "%s" as an invalid token', async (auth) => {
    const res = await call(auth)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${METADATA}", scope="email", error="invalid_token"`)
  })
})
