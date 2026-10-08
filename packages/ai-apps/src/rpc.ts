/**
 * The server's one way into the database (PLAN §2.5): a POST to one of the
 * `ai_app_*` functions with the caller's own token, so row-level security
 * applies as the owner, and 0020's gate counts the call. Every address is
 * built from the environment, and no redirect is followed.
 *
 * Expected refusals come back as `{ refused: code }` and become one
 * sentence the AI app can pass on (§2.8). The body of a database error is
 * never logged or passed on: only its status and our code.
 */
import type { CallToolResult } from '@modelcontextprotocol/server'
import { CALL_TIMEOUT_MS, type Project } from './auth.js'
import { log } from './log.js'

/** Who is asking, and how to reach the database as them. */
export type Caller = { readonly token: string; readonly project: Project; readonly fetchFn: typeof fetch }

export type RpcName =
  | 'ai_app_read'
  | 'ai_app_search'
  | 'ai_app_review'
  | 'ai_app_add_candidate'
  // 0039 (ADR 0013): suggesting changes and Review categories.
  | 'ai_app_propose'
  | 'ai_app_suggestions'
  | 'ai_app_suggest_categories'

/** Each refusal, in the words the AI app passes on to the owner. */
export const SENTENCES = {
  ai_apps_off: 'AI apps are switched off in the budget app. The owner can turn them on in Settings → Account → AI apps.',
  // 0030: the sign-in this token came from has ended, as Disconnect ends it.
  disconnected: 'This connection to the budget app has ended. The owner can connect again from Settings → Account → AI apps.',
  adding_off: 'Adding to Review is switched off in the budget app’s Settings → Account → AI apps.',
  suggesting_off: 'Suggesting changes is switched off in the budget app’s Settings → Account → AI apps.',
  bad_change: 'The budget app could not read that as a change. Each change needs its kind, what it changes and a reason, as the tool describes.',
  limit_reached: 'Today’s limit for AI apps is used up. It resets at midnight, the owner’s time.',
  needs_update: 'The budget app needs a one-time update. The owner can open Help → One-time updates.',
  no_account: 'Open the budget app once so it can set up the card account, then try again.',
  unknown_category: 'There is no category called that. Call list_categories for the exact names.',
  unknown_debt: 'There is no debt called that. Call get_debts without `debt` for the exact names.',
  no_pay_schedule:
    'No income is set up with paydays, so there is no pay period. The owner can give an Income row how often it pays, and a first payday, in the app’s Settings, under Lists.',
  bad_date: 'The date must be today or in the past year.',
  bad_amount: 'The amount must be more than $0.00 and at most $100,000.00.',
  bad_search:
    'A search’s dates must run forwards over at most three years, min_amount must not be above max_amount, and its words must not hold six or more digits in a row (those are masked in every shop name).',
  not_an_ai_app:
    'The budget app did not recognise this sign-in as an AI app’s. The owner should switch AI apps off in Settings → Account → AI apps and report it.',
  records_unreadable: 'The app could not read some of the records. The owner can open the app to see which.',
  server_error: 'Something went wrong in the budget app’s server. Nothing was changed.',
  // An add the database did not answer clearly may or may not have been written.
  not_confirmed:
    'The budget app did not confirm the add. Asking again with the same details never adds it twice; list_review_queue shows what is waiting.',
} as const

export type RefusalCode = keyof typeof SENTENCES
export type Refusal = { readonly refused: RefusalCode }

const isCode = (code: unknown): code is RefusalCode => typeof code === 'string' && Object.hasOwn(SENTENCES, code)

export const isRefusal = (value: unknown): value is Refusal =>
  typeof value === 'object' && value !== null && 'refused' in value

/** The function's answer as an object, or the refusal the AI app is told. */
export async function rpc(caller: Caller, fn: RpcName, args: Readonly<Record<string, unknown>>): Promise<Record<string, unknown> | Refusal> {
  let res: Response
  try {
    res = await caller.fetchFn(`${caller.project.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: caller.project.anonKey,
        Authorization: `Bearer ${caller.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      redirect: 'error',
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    })
  } catch {
    log('rpc_unreachable')
    return { refused: 'server_error' }
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    // PostgREST's "no such function": 0020 is not pasted yet.
    if (typeof body === 'object' && body !== null && 'code' in body && body.code === 'PGRST202') return { refused: 'needs_update' }
    log('rpc_status', { status: res.status })
    return { refused: 'server_error' }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    log('rpc_shape')
    return { refused: 'server_error' }
  }
  if ('refused' in body) return { refused: isCode(body.refused) ? body.refused : 'server_error' }
  return body as Record<string, unknown>
}

/** Read tools overwrite nothing and read the same twice (ChatGPT confirms any tool without readOnlyHint). */
export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

/**
 * The two add tools write, but overwrite nothing, and the dedupe hash makes
 * a repeat add nothing. Suggesting is the same: a repeated suggestion is
 * already suggested, and nothing changes until the owner applies it.
 */
export const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

/** Sign-in declared per tool, where OpenAI's Apps SDK reads it; other clients ignore it. */
export const SIGNED_IN = { securitySchemes: [{ type: 'oauth2' }] } as const

/** A tool's answer: structured, and the same object as JSON text for older clients. */
export function answer(result: Readonly<Record<string, unknown>>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: { ...result } }
}

/** A refusal the AI app can pass on, in one sentence. */
export function refusal(code: RefusalCode): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: SENTENCES[code] }] }
}
