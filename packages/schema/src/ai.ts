/**
 * What the app and the AI helper say to each other (ADR 0004, plan §3.2).
 *
 * The helper (`supabase/functions/ai/index.ts`) is pasted into Supabase as
 * one file, so it cannot import this package: it parses each request with
 * its own zod schema. These are the types that schema must agree with, and
 * a contract test in the functions' tests holds the two together, so the
 * app can never send a request the helper refuses as malformed.
 *
 * Only the actions the helper has are here. Each later slice adds its own
 * action beside its handler (A10 the keys, A11 `run`), so no type promises
 * an action nothing answers.
 */
import { z } from 'zod'
import type { NarrateDaily } from './narrate.js'
import type { NarrateReport } from './report.js'
import type { NarrateCheckin } from './checkin.js'
import type { CategoriseBrief } from './categorise.js'
import type { QuickAddBrief } from './quick-add.js'
import type { ReceiptPhoto } from './receipt.js'
import type { AskBrief } from './ask.js'

/**
 * The AI services, in 0016's `ai_provider` enum order, which is also the
 * order they are tried in until the owner chooses another: free Gemini
 * first, the other free services, then the paid ones.
 */
export const AiProviderSchema = z.enum(['gemini', 'groq', 'openrouter', 'openai', 'anthropic'])
export type AiProvider = z.infer<typeof AiProviderSchema>

/** The services a key can be pasted for: every one of them (A11). */
export type AiKeyProvider = AiProvider

/**
 * Every request the helper answers. It learns who is asking from the token,
 * never the body. A pasted key is 20 to 200 characters of letters, digits
 * and `_ . : -` (AI_KEY_SHAPE); `save_key` sends it once and nothing sends
 * it back. `test_key` is also Check which models work.
 */
export type AiRequest =
  | { readonly action: 'ping' }
  | { readonly action: 'status' }
  | { readonly action: 'save_key'; readonly provider: AiKeyProvider; readonly key: string }
  | { readonly action: 'test_key'; readonly provider: AiKeyProvider }
  | { readonly action: 'run'; readonly task: 'test' }
  | { readonly action: 'run'; readonly task: 'narrate'; readonly pack: 'daily'; readonly data: NarrateDaily }
  | { readonly action: 'run'; readonly task: 'narrate'; readonly pack: 'report'; readonly data: NarrateReport }
  | { readonly action: 'run'; readonly task: 'narrate'; readonly pack: 'checkin'; readonly data: NarrateCheckin }
  | { readonly action: 'run'; readonly task: 'categorise'; readonly data: CategoriseBrief }
  | { readonly action: 'run'; readonly task: 'quick_add'; readonly data: QuickAddBrief }
  | { readonly action: 'run'; readonly task: 'receipt'; readonly data: ReceiptPhoto }
  | { readonly action: 'run'; readonly task: 'ask'; readonly data: AskBrief }

/**
 * The tasks `run` takes. Each carries data, never a prompt: the prompt and
 * the reply's shape live in the helper. `test` checks the whole path on
 * whichever service answers first; `narrate` words the Coach's day from a
 * brief with no figure in it (A12), a month's review (A15) and the Sunday
 * check-in (A20); `categorise` suggests categories for rows waiting in
 * Review (A21); `quick_add` fills what Just type it's parser left empty
 * (A22); `receipt` reads a receipt photo, on a service that reads images
 * (A23); `ask` reads a question into a plan the app answers (A24); each
 * later task joins with its slice.
 */
export type AiTask = 'test' | 'narrate' | 'categorise' | 'quick_add' | 'receipt' | 'ask'

/** What the helper takes as a key, so the app can say "check you copied all of it" before sending. */
export const AI_KEY_SHAPE = /^[A-Za-z0-9_.:-]{20,200}$/
export type AiAction = AiRequest['action']

/**
 * The helper's version this app expects (its `VERSION`, which `ping`
 * returns; a contract test holds the two equal). A deployed copy older
 * than this refuses the newer actions, so One-time updates asks for the
 * new version to be pasted over it. Bumped with every change to the
 * helper, as `YYYY-MM-DD.N`.
 */
export const AI_HELPER_VERSION = '2026-10-01.4'

/**
 * Every failure the helper answers with, as a code the app turns into a
 * sentence (plan §3.2). Codes only, so each is safe to log. `helper_error`
 * is the helper's own trouble: a secret it needs is missing, or its
 * database answered with something other than "not there yet".
 */
export const AI_CODES = [
  'not_signed_in',
  'origin_not_allowed',
  'method_not_allowed',
  'bad_request',
  'ai_off',
  'not_set_up',
  'needs_update',
  'limit_reached',
  'all_resting',
  'all_failed',
  'key_rejected',
  'keys_locked',
  'helper_error',
] as const
export type AiCode = (typeof AI_CODES)[number]

/** Where a service's key comes from: pasted in AI settings, a Supabase secret, or nowhere. */
export type AiKeySource = 'saved' | 'secret' | 'none'
/** What a saved key's last test found (0016's CHECK on `ai_provider_keys.status`). */
export type AiKeyStatus = 'ok' | 'busy' | 'rejected' | 'locked'

/** One service as `status` describes it. Never a key: at most its last four characters. */
export interface AiServiceStatus {
  readonly provider: AiProvider
  readonly tier: 'free' | 'paid'
  readonly source: AiKeySource
  readonly hint: string | null
  /** A saved key's last test; null for the secret, which is tested when it is used. */
  readonly status: AiKeyStatus | null
  /** The model that would be asked: the owner's choice when it is on the helper's list, else the list's first. */
  readonly model: string
}

export interface AiPingReply {
  readonly ok: true
  readonly version: string
}

export interface AiStatusReply {
  readonly ok: true
  readonly version: string
  readonly enabled: boolean
  readonly allowPaid: boolean
  readonly services: readonly AiServiceStatus[]
  /** Calls counted today (the Pacific day) and the owner's daily limit. */
  readonly today: { readonly used: number; readonly cap: number }
}

export interface AiFailureReply {
  readonly ok: false
  readonly code: AiCode
}

/** A model on the helper's committed list, and whether the key's service lists it for this key. */
export interface AiModelChoice {
  readonly id: string
  readonly listed: boolean
}

/**
 * What `save_key` or `test_key` found. `source` is `none` when a pasted key
 * was turned down and so not stored. `models` is every committed model,
 * ticked when the key can use it, and empty unless the test worked.
 */
export interface AiKeyReply {
  readonly ok: true
  readonly provider: AiKeyProvider
  readonly source: AiKeySource
  readonly status: AiKeyStatus
  readonly hint: string | null
  readonly models: readonly AiModelChoice[]
}
