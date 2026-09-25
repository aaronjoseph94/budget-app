// ai — the AI helper: every AI call the app makes goes through here.
//
// A Supabase Edge Function, because a provider key must never reach the
// browser (CLAUDE.md). ADR 0004 is the design: one helper for every task,
// keys kept encrypted in 0016's ai_provider_keys, a hardcoded allowlist of
// services, and failing over between them. This version answers `ping`,
// which says the helper is deployed; the rest arrives a part at a time.
//
// Who is calling comes from Supabase's auth server, asked with the
// caller's own token, never from the request body.
//
// Logs carry the action, a code and counts. Never a key, a token, a prompt,
// a payload value or a reply (CLAUDE.md).
//
// Self-contained on purpose, so it can be pasted into the Supabase
// dashboard's editor as one file: its only import is zod, pinned in the URL.
// It exports `handle` so the gates can test it with a fake fetch, and serves
// only when it runs under Deno.

import { z } from 'npm:zod@4.6.5'

/** Which copy is deployed, so One-time updates can tell an old paste from this one. */
export const VERSION = '2026-09-25.1'

// Browsers allowed to call this, as read-receipt's: the Cloudflare and
// Netlify sites and a local dev server, plus exact https origins in the
// EXTRA_ORIGINS secret (comma-separated) for a custom domain.
const ORIGINS = [
  'https://aaron-budget-app.pages.dev',
  'https://aaron-budget-app.netlify.app',
  'http://localhost:5173',
]

// The secrets this helper reads, parsed at the "env loading" boundary.
// Supabase sets the first four itself. SUPABASE_SECRET_KEYS is a JSON
// object of the project's new secret keys, by name.
const EnvSchema = z.object({
  SUPABASE_URL: z.string().regex(/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/).optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEYS: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  EXTRA_ORIGINS: z.string().optional(),
})
type Env = z.infer<typeof EnvSchema>

// Every body the helper takes, and nothing more: .strict() refuses any other
// field, so no URL, host, user id or prompt can ride along (ADR 0004).
export const RequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ping') }).strict(),
])
type Request_ = z.infer<typeof RequestSchema>

type Code =
  | 'not_signed_in'
  | 'origin_not_allowed'
  | 'method_not_allowed'
  | 'bad_request'
  | 'helper_error'

const STATUS_OF: Readonly<Record<Code, number>> = {
  not_signed_in: 401,
  origin_not_allowed: 403,
  method_not_allowed: 405,
  bad_request: 400,
  helper_error: 503,
}

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
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

// The one place this file writes a log line, and all it can say: a fixed
// code and numbers. The types leave no room for anything else.
type LogCode = 'auth_unreachable' | 'auth_status' | 'not_configured'
function log(code: LogCode, counts: Record<string, number> = {}): void {
  console.log(JSON.stringify({ fn: 'ai', code, ...counts }))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Who is calling: the auth server's answer to the caller's own token.
 * "Enforce JWT verification" has already checked the token's signature;
 * this is what turns it into a user id the body cannot forge.
 */
type Who = { readonly user: string } | { readonly code: Code }

async function whoIs(env: Env, bearer: string, fetchFn: typeof fetch): Promise<Who> {
  if (env.SUPABASE_URL === undefined || env.SUPABASE_ANON_KEY === undefined) {
    log('not_configured')
    return { code: 'helper_error' }
  }
  let res: Response
  try {
    res = await fetchFn(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: bearer },
    })
  } catch {
    log('auth_unreachable')
    return { code: 'helper_error' }
  }
  if (res.status === 401 || res.status === 403) return { code: 'not_signed_in' }
  if (!res.ok) {
    log('auth_status', { status: res.status })
    return { code: 'helper_error' }
  }
  const user: unknown = await res.json().catch(() => null)
  const id = typeof user === 'object' && user !== null && 'id' in user ? user.id : null
  return typeof id === 'string' && UUID.test(id) ? { user: id.toLowerCase() } : { code: 'not_signed_in' }
}

export async function handle(
  req: Request,
  rawEnv: Readonly<Record<string, string | undefined>>,
  fetchFn: typeof fetch,
): Promise<Response> {
  const origin = req.headers.get('origin')
  // Secrets zod cannot read count as unset, which ends in helper_error.
  const parsedEnv = EnvSchema.safeParse(rawEnv)
  const env: Env = parsedEnv.success ? parsedEnv.data : {}
  const origins = allowedOrigins(env)
  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...cors(origin, origins) },
    })
  const fail = (code: Code) => send(STATUS_OF[code], { ok: false, code })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, origins) })
  if (req.method !== 'POST') return fail('method_not_allowed')
  if (origin !== null && !origins.has(origin)) return fail('origin_not_allowed')

  const bearer = req.headers.get('authorization')
  if (bearer === null || !/^Bearer \S+$/.test(bearer)) return fail('not_signed_in')

  let body: Request_
  try {
    const parsed = RequestSchema.safeParse(await req.json())
    if (!parsed.success) return fail('bad_request')
    body = parsed.data
  } catch {
    return fail('bad_request')
  }

  const who = await whoIs(env, bearer, fetchFn)
  if ('code' in who) return fail(who.code)

  // Answered only for a signed-in caller, so the version is no one else's business.
  if (body.action === 'ping') return send(200, { ok: true, version: VERSION })
  return fail('bad_request')
}

// Only the names this helper reads are handed over.
if (typeof Deno !== 'undefined') {
  Deno.serve((req) =>
    handle(
      req,
      {
        SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
        SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
        SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        SUPABASE_SECRET_KEYS: Deno.env.get('SUPABASE_SECRET_KEYS'),
        GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY'),
        GEMINI_MODEL: Deno.env.get('GEMINI_MODEL'),
        EXTRA_ORIGINS: Deno.env.get('EXTRA_ORIGINS'),
      },
      fetch,
    ),
  )
}
