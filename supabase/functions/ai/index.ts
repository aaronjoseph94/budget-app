// ai — the AI helper: every AI call the app makes goes through here.
//
// A Supabase Edge Function, because a provider key must never reach the
// browser (CLAUDE.md). ADR 0004 is the design: one helper for every task,
// keys kept encrypted in 0016's ai_provider_keys, a hardcoded allowlist of
// services, and failing over between them. This version answers `ping`,
// which says the helper is deployed, and `status`, which says what is set
// up; the keys and the tasks arrive in later slices (plan A10, A11).
//
// Who is calling comes from Supabase's auth server, asked with the
// caller's own token, never from the request body. The database is reached
// only through 0016's functions granted to service_role alone, each told
// that user explicitly.
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
  // Optional: a root of the owner's own for sealing pasted keys, so they
  // survive a change of Supabase's keys (ADR 0004).
  AI_KEYS_ROOT: z.string().optional(),
})
type Env = z.infer<typeof EnvSchema>

// Every body the helper takes, and nothing more: .strict() refuses any other
// field, so no URL, host, user id or prompt can ride along (ADR 0004).
export const RequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ping') }).strict(),
  z.object({ action: z.literal('status') }).strict(),
])
type Request_ = z.infer<typeof RequestSchema>

type Code =
  | 'not_signed_in'
  | 'origin_not_allowed'
  | 'method_not_allowed'
  | 'bad_request'
  | 'needs_update'
  | 'helper_error'

const STATUS_OF: Readonly<Record<Code, number>> = {
  not_signed_in: 401,
  origin_not_allowed: 403,
  method_not_allowed: 405,
  bad_request: 400,
  needs_update: 503,
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
type LogCode = 'auth_unreachable' | 'auth_status' | 'not_configured' | 'db_unreachable' | 'db_status' | 'db_shape'
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

// The services, their tier and their models, the default first (ADR 0004's
// allowlist; each service's host and paths join it with its adapter, A10
// and A11). A model is only ever one of these: the owner's choice, when it
// is on the list, or the list's first.
const SERVICES = {
  gemini: { tier: 'free', models: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'] },
  groq: { tier: 'free', models: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'] },
  openrouter: { tier: 'free', models: ['openrouter/free'] },
  openai: { tier: 'paid', models: ['gpt-5-nano', 'gpt-5-mini'] },
  anthropic: { tier: 'paid', models: ['claude-haiku-4-5', 'claude-sonnet-5'] },
} as const
type Provider = keyof typeof SERVICES
const PROVIDERS = Object.keys(SERVICES) as readonly string[]
const isProvider = (p: unknown): p is Provider => typeof p === 'string' && PROVIDERS.includes(p)

function modelFor(provider: Provider, ...choices: readonly unknown[]): string {
  const list: readonly string[] = SERVICES[provider].models
  const chosen = choices.find((c): c is string => typeof c === 'string' && list.includes(c))
  return chosen ?? list[0] ?? ''
}

/** The project's new secret key, from the JSON of them all, when it has one. */
function secretKeysDefault(env: Env): string | null {
  let fresh: unknown = null
  try {
    const keys: unknown = JSON.parse(env.SUPABASE_SECRET_KEYS ?? 'null')
    fresh = typeof keys === 'object' && keys !== null && 'default' in keys ? keys.default : null
  } catch {
    fresh = null
  }
  return typeof fresh === 'string' && fresh !== '' ? fresh : null
}

/**
 * The key the helper reaches the database with: the project's new secret
 * key when it has one, else the legacy service_role key. It always goes in
 * `apikey`. A legacy key is a three-part JWT and goes as the bearer too; a
 * new `sb_secret_` key is not a JWT, and Supabase refuses one as a bearer.
 */
function databaseKey(env: Env): string | null {
  return secretKeysDefault(env) ?? env.SUPABASE_SERVICE_ROLE_KEY ?? null
}

// ---------------------------------------------------------------------------
// Sealing a pasted key (ADR 0004). AES-256-GCM with a random 12-byte IV,
// under a key derived by HKDF-SHA-256 from a root the helper already holds.
// The additional data names the user and the service, so a ciphertext moved
// to another row or another user cannot be opened. kek_id says which root
// sealed it without saying anything about the root.
// ---------------------------------------------------------------------------

const SALT = new TextEncoder().encode('budget-app:ai-provider-keys:v1')
const KEY_V = 1

/**
 * Every root present, the one that seals new keys first: the owner's own
 * AI_KEYS_ROOT, then the legacy service_role key, then the new secret key.
 * The order differs from databaseKey's on purpose: a root the owner chose
 * outlives a change of Supabase's keys, so it seals first.
 */
function keyRoots(env: Env): string[] {
  return [env.AI_KEYS_ROOT?.trim(), env.SUPABASE_SERVICE_ROLE_KEY, secretKeysDefault(env)].filter(
    (r): r is string => typeof r === 'string' && r !== '',
  )
}

async function derive(root: string, info: string, bits: number): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(root), 'HKDF', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: new TextEncoder().encode(info) }, base, bits)
}

async function kekIdOf(root: string): Promise<string> {
  return [...new Uint8Array(await derive(root, 'kek-id/v1', 64))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sealingKey(root: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await derive(root, 'aes-gcm/v1', 256), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

const additionalData = (user: string, provider: string) => new TextEncoder().encode(`${user}:${provider}:v1`)
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

export interface Sealed {
  readonly ciphertext: string
  readonly iv: string
  readonly kek_id: string
  readonly key_v: number
}

/** A key sealed for this user and service, or null when the helper holds no root to seal it with. */
export async function sealKey(env: Env, user: string, provider: string, key: string): Promise<Sealed | null> {
  const root = keyRoots(env)[0]
  if (root === undefined) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(user, provider) },
    await sealingKey(root),
    new TextEncoder().encode(key),
  )
  return { ciphertext: toBase64(new Uint8Array(sealed)), iv: toBase64(iv), kek_id: await kekIdOf(root), key_v: KEY_V }
}

/**
 * The key again, or null when no root the helper holds can open it: sealed
 * under a root since changed, or for another user or service. Null is the
 * `locked` state, never an error: the owner pastes the key again.
 */
export async function openKey(env: Env, user: string, provider: string, sealed: Sealed): Promise<string | null> {
  for (const root of keyRoots(env)) {
    if ((await kekIdOf(root)) !== sealed.kek_id) continue
    try {
      const key = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(sealed.iv), additionalData: additionalData(user, provider) },
        await sealingKey(root),
        fromBase64(sealed.ciphertext),
      )
      return new TextDecoder().decode(key)
    } catch {
      // Wrong additional data, a damaged row, or two roots sharing an id: try the next.
    }
  }
  return null
}

const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
// What PostgREST and Postgres say when 0016's function is not there yet.
const NOT_THERE = new Set(['PGRST202', '42883', 'PGRST205', '42P01'])

/** One of 0016's service_role functions, for this user; or the code to answer with. */
async function callDb(env: Env, fn: string, args: Record<string, unknown>, fetchFn: typeof fetch): Promise<{ data: unknown } | { code: Code }> {
  const key = databaseKey(env)
  if (env.SUPABASE_URL === undefined || key === null) {
    log('not_configured')
    return { code: 'helper_error' }
  }
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' }
  if (JWT.test(key)) headers['Authorization'] = `Bearer ${key}`
  let res: Response
  try {
    res = await fetchFn(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) })
  } catch {
    log('db_unreachable')
    return { code: 'helper_error' }
  }
  const body: unknown = await res.json().catch(() => null)
  if (res.ok) return { data: body }
  const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : null
  if (typeof code === 'string' && NOT_THERE.has(code)) return { code: 'needs_update' }
  log('db_status', { status: res.status })
  return { code: 'helper_error' }
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const list = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : [])
const HINT = /^[A-Za-z0-9_.:-]{1,4}$/
const KEY_STATUSES: readonly unknown[] = ['ok', 'busy', 'rejected', 'locked']

/**
 * What is set up, from ai_context_for: each service's key source, its last
 * four characters and last test, and the model it would use; today's calls
 * against the owner's limit. Built field by field from what is needed, so
 * a ciphertext, an IV or a root's id is never in the reply.
 */
function statusOf(env: Env, context: unknown): Record<string, unknown> | null {
  const ctx = obj(context)
  const settings = obj(ctx['settings'])
  const models = obj(settings['models'])
  const cap = settings['daily_cap']
  if (typeof cap !== 'number' || !Array.isArray(ctx['keys']) || !Array.isArray(ctx['usage'])) return null
  const saved = new Map(list(ctx['keys']).map(obj).filter((k) => isProvider(k['provider'])).map((k) => [k['provider'], k]))
  const secret = env.GEMINI_API_KEY?.trim() ?? ''
  const services = PROVIDERS.filter(isProvider).map((provider) => {
    const key = saved.get(provider)
    // A pasted key wins over the secret; each line below asks for it first.
    const fromSecret = provider === 'gemini' && secret !== ''
    const hint = key !== undefined ? key['key_hint'] : fromSecret ? secret.slice(-4) : null
    return {
      provider,
      tier: SERVICES[provider].tier,
      source: key !== undefined ? 'saved' : fromSecret ? 'secret' : 'none',
      hint: typeof hint === 'string' && HINT.test(hint) ? hint : null,
      status: key !== undefined && KEY_STATUSES.includes(key['status']) ? key['status'] : null,
      model: modelFor(provider, models[provider], provider === 'gemini' ? env.GEMINI_MODEL : undefined),
    }
  })
  // A count of calls, never money (ADR 0004).
  const used = list(ctx['usage']).reduce<number>((n, u) => n + (Number(obj(u)['attempts']) || 0), 0)
  return {
    ok: true,
    version: VERSION,
    enabled: settings['enabled'] !== false,
    allowPaid: settings['allow_paid'] === true,
    services,
    today: { used, cap },
  }
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

  const context = await callDb(env, 'ai_context_for', { p_user: who.user }, fetchFn)
  if ('code' in context) return fail(context.code)
  const status = statusOf(env, context.data)
  if (status === null) {
    log('db_shape')
    return fail('helper_error')
  }
  return send(200, status)
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
        AI_KEYS_ROOT: Deno.env.get('AI_KEYS_ROOT'),
      },
      fetch,
    ),
  )
}
