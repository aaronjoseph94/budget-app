/**
 * The AI apps server (ADR 0012, PLAN §2.2): the Edge Function `mcp` that
 * Claude, ChatGPT and other MCP clients call. `handle` serves one request;
 * `src/deno.ts` hands it Deno's requests, and the tests hand it theirs.
 *
 * Nothing is kept between calls and no figure is ever cached: every
 * response says `Cache-Control: no-store`.
 *
 * Paths, as the function sees them:
 * - `POST /mcp`: the MCP endpoint, served by the official SDK for both
 *   protocol eras in use (2025's `initialize`; 2026-07-28's
 *   `server/discover`), statelessly: a fresh server per request. Any other
 *   method is 405.
 *   It needs an AI app's token (src/auth.ts); without one, the 401 says
 *   where to sign in. A request gets 20 s in all.
 * - `GET /mcp/.well-known/oauth-protected-resource`: RFC 9728's metadata.
 * - `GET /mcp/health`: `{ ok, version, tools }`, no token, CORS for the
 *   app's own origins only, so One-time updates can check the paste.
 */
import { z } from 'zod'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { MCP_SERVER_VERSION } from '@budget/schema'
import { checkToken, json, protectedResource, type Project } from './auth.js'
import { log } from './log.js'
import { TOOLS, budgetServer } from './server.js'

// The app's own sites and its dev server, plus exact https origins in the
// EXTRA_ORIGINS secret, as the AI helper allows. Claude and ChatGPT call
// from their servers and send no Origin; a browser page on any other origin
// is refused (the spec's DNS-rebinding rule).
const ORIGINS = ['https://aaron-budget-app.pages.dev', 'https://aaron-budget-app.netlify.app', 'http://localhost:5173']

// The environment boundary. Supabase sets the first three. There is no field
// for a service key: this server acts only with the caller's own token.
// SUPABASE_PUBLISHABLE_KEYS is a JSON object of the project's new public
// keys, by name; its `default` is used before the legacy anon key, which
// stops working once the project's legacy keys are switched off
// (backend-b-04, as the AI helper's publicKey does).
const EnvSchema = z.object({
  SUPABASE_URL: z.string().regex(/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/).optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_PUBLISHABLE_KEYS: z.string().optional(),
  EXTRA_ORIGINS: z.string().optional(),
})
export type Env = z.infer<typeof EnvSchema>

/** The largest request body the server reads (PLAN §2.7). */
export const MAX_BODY_BYTES = 64 * 1024

/** The most a request may take in all (PLAN §2.7), far under the platform's 150 s. */
export const DEADLINE_MS = 20_000

// Built once per instance; it holds no request's state. The SDK's error
// hook logs the code only: an error's message can carry a tool's arguments.
const mcp = createMcpHandler(budgetServer, {
  legacy: 'stateless',
  responseMode: 'json',
  maxRequestBodySize: MAX_BODY_BYTES,
  // No subscriptions/listen streams at all: the SDK serves them as events
  // whatever responseMode says, past the deadline and past Disconnect.
  // With 0 it answers -32603 as plain JSON at once (security review
  // mcp-c-01; PLAN §2.2's "nothing streams", held by mcp-protocol.test.ts).
  maxSubscriptions: 0,
  onerror: () => log('sdk_error'),
})

function allowedOrigins(env: Env): Set<string> {
  return new Set([
    ...ORIGINS,
    ...(env.EXTRA_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(o)),
  ])
}

function cors(origin: string | null, origins: Set<string>): Record<string, string> {
  if (origin === null || !origins.has(origin)) return {}
  // The headers supabase-js sends with functions.invoke, which One-time updates uses.
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  }
}

/** The same response, never to be kept by a client or a proxy. */
function noStore(res: Response): Response {
  const headers = new Headers(res.headers)
  headers.set('Cache-Control', 'no-store')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

/** The work's answer, or 503 once the deadline passes. */
async function withDeadline(work: Promise<Response>): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<Response>((resolve) => {
    timer = setTimeout(() => {
      log('deadline')
      resolve(json(503, { error: 'deadline' }))
    }, DEADLINE_MS)
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

async function serveMcp(req: Request, project: Project, fetchFn: typeof fetch): Promise<Response> {
  const caller = await checkToken(project, req.headers.get('authorization'), fetchFn)
  if (caller instanceof Response) return caller
  // The tools reach the database as this caller, through this project only.
  return mcp.fetch(req, { authInfo: { ...caller, extra: { ...caller.extra, project, fetchFn } } })
}

async function route(req: Request, env: Env, fetchFn: typeof fetch): Promise<Response> {
  // Supabase hands the function `/mcp…`; the project's full address works too.
  const path = /^(?:\/functions\/v1)?\/mcp(\/.*)?$/.exec(new URL(req.url).pathname)
  if (path === null) return json(404, { error: 'not_found' })
  const rest = path[1] ?? ''
  const origin = req.headers.get('origin')
  const origins = allowedOrigins(env)
  if (origin !== null && !origins.has(origin)) {
    log('origin_refused')
    return json(403, { error: 'origin_not_allowed' })
  }

  if (rest === '/health') {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, origins) })
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' }, { Allow: 'GET, OPTIONS' })
    return json(200, { ok: true, version: MCP_SERVER_VERSION, tools: TOOLS.length }, cors(origin, origins))
  }
  const metadata = rest === '/.well-known/oauth-protected-resource'
  if (!metadata && rest !== '' && rest !== '/') return json(404, { error: 'not_found' })
  const allow = metadata ? 'GET' : 'POST'
  if (req.method !== allow) return json(405, { error: 'method_not_allowed' }, { Allow: allow })
  const anonKey = publicKey(env)
  if (env.SUPABASE_URL === undefined || anonKey === null) {
    log('not_configured')
    return json(503, { error: 'not_configured' })
  }
  const project = { url: env.SUPABASE_URL, anonKey }
  if (metadata) return json(200, protectedResource(project))
  return withDeadline(serveMcp(req, project, fetchFn))
}

/** The publishable key's `default` when it is a non-empty string, else the anon key, else none. */
function publicKey(env: Env): string | null {
  let fresh: unknown = null
  try {
    const keys: unknown = JSON.parse(env.SUPABASE_PUBLISHABLE_KEYS ?? 'null')
    fresh = typeof keys === 'object' && keys !== null && 'default' in keys ? keys.default : null
  } catch {
    fresh = null
  }
  return typeof fresh === 'string' && fresh !== '' ? fresh : (env.SUPABASE_ANON_KEY ?? null)
}

export async function handle(
  req: Request,
  rawEnv: Readonly<Record<string, string | undefined>>,
  fetchFn: typeof fetch,
): Promise<Response> {
  // A secret zod cannot read counts as unset, which ends in not_configured.
  const parsed = EnvSchema.safeParse(rawEnv)
  return noStore(await route(req, parsed.success ? parsed.data : {}, fetchFn))
}
