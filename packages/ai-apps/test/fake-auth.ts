/**
 * An AI app's token as Supabase's OAuth server issues it, and a fake of
 * this project's Auth: nothing in these tests reaches Supabase. Each call
 * the server makes is recorded; a redirect behaves as `redirect: 'error'`
 * makes a real fetch behave.
 */
export const PROJECT = 'https://project.supabase.co'
export const ENV = { SUPABASE_URL: PROJECT, SUPABASE_ANON_KEY: 'anon-key-for-tests' }
export const USER = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455'
export const CLIENT = '0a1b2c3d-4e5f-4a6b-8c7d-8e9fa0b1c2d3'

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

export function tokenWith(claims: Record<string, unknown>, signature = 'sig'): string {
  return `${b64url({ alg: 'ES256', typ: 'JWT' })}.${b64url(claims)}.${signature}`
}

export const AI_APP_CLAIMS = { iss: `${PROJECT}/auth/v1`, role: 'authenticated', sub: USER, client_id: CLIENT, aud: 'authenticated' }
export const AI_APP_TOKEN = tokenWith(AI_APP_CLAIMS)

export type Call = { url: string; init: RequestInit }
export type Respond = (url: string, init: RequestInit) => Response | Promise<Response>

export const signedIn: Respond = () => new Response(JSON.stringify({ id: USER, aud: 'authenticated' }), { status: 200 })

export function fakeFetch(respond: Respond = signedIn): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const res = await respond(String(url), init ?? {})
    if (res.status >= 300 && res.status < 400 && init?.redirect === 'error') throw new TypeError('fetch failed: redirect')
    return res
  }) as typeof fetch
  return { fetchFn, calls }
}
