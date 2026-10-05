/**
 * Settings → AI apps (PLAN §2.9, ADR 0012): the owner's switch, whether AI
 * apps may add to Review, and the window Connect a new AI app opens, kept
 * in 0020's ai_app_access. The browser reads and writes its own row through
 * row-level security; an AI app's token cannot write it (0020's restrictive
 * policies), so an AI app can never switch itself on or open its own window.
 *
 * With no row saved, AI apps are off: 0020's own default.
 */
import { whyRefused } from '../ledger.js'
import type { SupabaseClient } from '../supabase.js'

export interface Access {
  readonly enabled: boolean
  readonly allowAdd: boolean
  /** Whether they may suggest changes (0039, ADR 0013); null before 0039 is in. */
  readonly allowPropose: boolean | null
  /** Until when the consent page may allow a new connection, as stored; null when never opened. */
  readonly connectUntil: string | null
}

const NO_ACCESS: Access = { enabled: false, allowAdd: true, allowPropose: true, connectUntil: null }

/** How long Connect a new AI app keeps the door open (PLAN §2.10). */
export const CONNECT_MINUTES = 15

export type Why = 'needs_update' | 'unreachable'
export type AccessRead = { readonly ok: true; readonly access: Access } | { readonly ok: false; readonly why: Why }

export async function readAccess(supabase: SupabaseClient, userId: string): Promise<AccessRead> {
  const read = (columns: string) => supabase.from('ai_app_access').select(columns).eq('user_id', userId).maybeSingle()
  let { data, error } = await read('enabled, allow_add, allow_propose, connect_until')
  // Before 0039 there is no allow_propose: read the rest, and say suggesting needs the update.
  const before0039 = error !== null && error.code === '42703'
  if (before0039) ({ data, error } = await read('enabled, allow_add, connect_until'))
  if (error !== null) return { ok: false, why: whyRefused(error) }
  if (data === null) return { ok: true, access: { ...NO_ACCESS, allowPropose: before0039 ? null : true } }
  const row = data as { enabled?: unknown; allow_add?: unknown; allow_propose?: unknown; connect_until?: unknown }
  return {
    ok: true,
    access: {
      enabled: row.enabled === true,
      allowAdd: row.allow_add !== false,
      allowPropose: before0039 ? null : row.allow_propose !== false,
      connectUntil: typeof row.connect_until === 'string' ? row.connect_until : null,
    },
  }
}

/**
 * Save what changed, creating the row when there is none. The browser's
 * time zone goes with every save, so "today" for the daily limits follows
 * where the owner last used Settings (PLAN risk 17); 0020 refuses a zone
 * Postgres does not know.
 */
export async function saveAccess(
  supabase: SupabaseClient,
  userId: string,
  change: { readonly enabled?: boolean; readonly allowAdd?: boolean; readonly allowPropose?: boolean; readonly connectUntil?: string },
): Promise<true | Why> {
  const row = {
    user_id: userId,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(change.enabled === undefined ? {} : { enabled: change.enabled }),
    ...(change.allowAdd === undefined ? {} : { allow_add: change.allowAdd }),
    ...(change.allowPropose === undefined ? {} : { allow_propose: change.allowPropose }),
    ...(change.connectUntil === undefined ? {} : { connect_until: change.connectUntil }),
  }
  const { error } = await supabase.from('ai_app_access').upsert(row, { onConflict: 'user_id' })
  return error === null ? true : whyRefused(error)
}

/**
 * The address the owner pastes into Claude or ChatGPT: this project's `mcp`
 * function, exactly as the server names itself (`resourceOf` in
 * packages/ai-apps), from the client's own project, never typed or stored.
 */
export function serverAddress(supabase: SupabaseClient): string {
  return `${supabase.from('ai_app_access').url.origin}/functions/v1/mcp`
}

// C0, DEL and C1; zero-width and direction marks; line and paragraph
// separators, embeddings and overrides; the word joiner and isolates; the
// BOM: the characters the AI apps server strips from names (PLAN §2.4).
function hidden(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2069) ||
    code === 0xfeff
  )
}

/**
 * An AI app's name as the page draws it. Whoever registered the app chose
 * it, so it is text, never markup; it loses the characters that could hide
 * words or reverse how it reads, and is cut to 80 characters. Supabase's
 * answer is not parsed, and registration lets a client leave its name out,
 * so anything but text is no name rather than a page that stops drawing.
 */
export function shownName(name: string | null | undefined): string {
  const given = typeof name === 'string' ? name : ''
  const kept = [...given].filter((ch) => !hidden(ch.codePointAt(0) ?? 0)).slice(0, 80).join('').trim()
  return kept === '' ? 'An app with no name' : kept
}

export interface ConnectedApp {
  readonly clientId: string
  readonly name: string
  /** When the owner allowed it, as Supabase stamped it. */
  readonly connectedAt: string
  /** When it last asked something (0020's ai_app_last_use); null when never. */
  readonly lastUsedAt: string | null
}

export type AppsRead =
  /** `lastUseKnown` is false before 0020 is in, when when-last-used cannot be read. */
  | { readonly ok: true; readonly apps: readonly ConnectedApp[]; readonly lastUseKnown: boolean }
  /** `oauth_off`: Supabase's sign-in for AI apps is not switched on, which it answers 404. */
  | { readonly ok: false; readonly why: 'oauth_off' | 'unreachable' }

/**
 * The AI apps the owner has allowed, from Supabase's own list of grants.
 * Only the name, the client's id and when are read: the registrant chose
 * the client's `uri` and `logo_uri` too, and they are never drawn or
 * fetched.
 */
export async function readConnectedApps(supabase: SupabaseClient): Promise<AppsRead> {
  const [grants, uses] = await Promise.all([
    supabase.auth.oauth.listGrants(),
    supabase.from('ai_app_last_use').select('client_id, last_used_at'),
  ])
  if (grants.error !== null) {
    return { ok: false, why: grants.error.status === 404 || grants.error.code === 'feature_disabled' ? 'oauth_off' : 'unreachable' }
  }
  const last = new Map(uses.error === null ? (uses.data as { client_id: string; last_used_at: string }[]).map((u) => [u.client_id, u.last_used_at]) : [])
  return {
    ok: true,
    lastUseKnown: uses.error === null,
    apps: grants.data.map((g) => ({ clientId: g.client.id, name: shownName(g.client.name), connectedAt: g.granted_at, lastUsedAt: last.get(g.client.id) ?? null })),
  }
}

/**
 * Disconnect: Supabase revokes that app's grant, which should end its
 * sign-ins and refresh tokens, so the AI apps server and 0030 refuse it at
 * once. That it deletes the auth.sessions row is HANDOFF §4 check 21, not
 * yet run; the owner's words say "should" until it is.
 */
export async function disconnect(supabase: SupabaseClient, clientId: string): Promise<boolean> {
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
  return error === null
}

/**
 * Which AI app added each row waiting in Review (PLAN §2.9): its import's
 * ai_client_id, which 0020 takes from the AI app's own token, matched to
 * that app's grant. A row whose app cannot be told, because it was
 * disconnected or a read failed, is left out, and Review says "an AI app".
 */
export async function addedBy(supabase: SupabaseClient, rows: readonly { readonly id: string; readonly batch_id: string }[]): Promise<ReadonlyMap<string, string>> {
  const [batches, grants] = await Promise.all([
    supabase.from('ingest_batches').select('id, ai_client_id').in('id', [...new Set(rows.map((r) => r.batch_id))]),
    supabase.auth.oauth.listGrants(),
  ])
  if (batches.error !== null || grants.error !== null) return new Map()
  const apps = new Map(grants.data.map((g) => [g.client.id, shownName(g.client.name)]))
  const clients = new Map((batches.data as { id: string; ai_client_id: string | null }[]).map((b) => [b.id, b.ai_client_id]))
  return new Map(rows.flatMap((r) => {
    const name = apps.get(clients.get(r.batch_id) ?? '')
    return name === undefined ? [] : [[r.id, name] as const]
  }))
}
