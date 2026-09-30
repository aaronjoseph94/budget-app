/**
 * The AI apps server (ADR 0012, PLAN §2.2): the Edge Function `mcp` that
 * Claude, ChatGPT and other MCP clients call. `handle` serves one request;
 * `src/deno.ts` hands it Deno's requests, and the tests hand it theirs.
 *
 * Nothing is kept between calls and no figure is ever cached: every
 * response says `Cache-Control: no-store`.
 *
 * Paths, as the function sees them:
 * - `POST /mcp`: the MCP endpoint (M2a's dependency commit brings the SDK
 *   that serves it). Any other method is 405.
 * - `GET /mcp/health`: `{ ok, version, tools }`, no token, CORS for the
 *   app's own origins only, so One-time updates can check the paste.
 */
import { z } from 'zod'
import { MCP_SERVER_VERSION } from '@budget/schema'
import { log } from './log.js'

// The app's own sites and its dev server, plus exact https origins in the
// EXTRA_ORIGINS secret, as the AI helper allows. Claude and ChatGPT call
// from their servers and send no Origin; a browser page on any other origin
// is refused (the spec's DNS-rebinding rule).
const ORIGINS = ['https://aaron-budget-app.pages.dev', 'https://aaron-budget-app.netlify.app', 'http://localhost:5173']

// The environment boundary. Supabase sets the first two. There is no field
// for a service key: this server acts only with the caller's own token.
const EnvSchema = z.object({
  SUPABASE_URL: z.string().regex(/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/).optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  EXTRA_ORIGINS: z.string().optional(),
})
export type Env = z.infer<typeof EnvSchema>

/** The tools, in the order `tools/list` gives them. None yet (PLAN §3, M5b). */
const TOOLS: readonly unknown[] = []

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
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/** The same response, never to be kept by a client or a proxy. */
function noStore(res: Response): Response {
  const headers = new Headers(res.headers)
  headers.set('Cache-Control', 'no-store')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

async function route(req: Request, env: Env): Promise<Response> {
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
  if (rest !== '' && rest !== '/') return json(404, { error: 'not_found' })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' })
  if (env.SUPABASE_URL === undefined || env.SUPABASE_ANON_KEY === undefined) {
    log('not_configured')
    return json(503, { error: 'not_configured' })
  }
  return json(501, { error: 'not_built' })
}

export async function handle(req: Request, rawEnv: Readonly<Record<string, string | undefined>>): Promise<Response> {
  // A secret zod cannot read counts as unset, which ends in not_configured.
  const parsed = EnvSchema.safeParse(rawEnv)
  return noStore(await route(req, parsed.success ? parsed.data : {}))
}
