/**
 * The dedupe hash: the answer to "have I already got this charge?"
 *
 * This is the highest-stakes function in the ingestion path, and its two
 * failure modes are not symmetric:
 *
 *   - Too loose, and two genuinely different charges collide. One of them is
 *     silently dropped. Nothing on any screen says so. The user's totals are
 *     quietly wrong, and they find out by reconciling against a bank.
 *   - Too tight, and the same charge imports twice. A duplicate appears in the
 *     review queue where a human sees it and rejects it. Visible, and cheap.
 *
 * Everything below prefers the second. CLAUDE.md also forbids papering over a
 * duplicate at the query or UI layer — a duplicate is fixed here or not at all.
 *
 * WHY THE HASH IS COMPUTED OVER THE RAW MERCHANT STRING, NOT THE NORMALIZED
 * ONE. Normalization is a heuristic that will keep being tuned: strip this
 * processor prefix, drop that trailing store number. The hash must be stable
 * for the life of the data, because changing it means a version bump and a
 * backfill of every stored row. Feeding a moving heuristic into a value that
 * must not move couples the two, so that improving merchant display would
 * silently re-key the ledger. They are kept apart deliberately: normalization
 * serves display and merchant-rule matching, and the hash sees only what the
 * statement literally said.
 */
import type { Cents, IsoDate } from '@budget/money-primitives'

/** Bump on ANY change to the canonical string, with a backfill in the same migration. */
export const DEDUPE_HASH_VERSION = 1

/**
 * What distinguishes two charges that are otherwise identical.
 *
 * Two flat whites on the same card, same day, same price are two real
 * transactions — not a double-post. Without a discriminator they hash the same
 * and the ledger loses one, which is exactly the silent-drop failure above.
 */
export type OccurrenceDiscriminator =
  /** The issuer's own transaction id. Stable across re-downloads, so preferred. */
  | { readonly kind: 'issuer_id'; readonly id: string }
  /** 1-based index among identical rows in the batch, when the issuer gives no id. */
  | { readonly kind: 'occurrence'; readonly index: number }

export interface DedupeInput {
  readonly accountId: string
  readonly postedOn: IsoDate
  readonly amountCents: Cents
  /** Exactly as the statement wrote it. Never the normalized form. */
  readonly merchantRaw: string
  readonly discriminator: OccurrenceDiscriminator
}

/**
 * Fields are joined with NUL, which cannot appear in any of them — the schema's
 * `IngestedTextSchema` rejects control characters. A printable separator could
 * be smuggled inside a merchant name to make two different charges produce one
 * string, which is the silent-drop case reached deliberately.
 */
const SEP = '\u0000'

/**
 * The exact bytes that get hashed. Pure and synchronous, so the thing that
 * actually decides identity can be asserted directly rather than through a
 * digest that makes every failure look the same.
 */
export function dedupeCanonicalString(input: DedupeInput): string {
  const { discriminator: d } = input

  if (d.kind === 'issuer_id' && d.id.length === 0) {
    throw new RangeError('An issuer transaction id must not be empty; use an occurrence index')
  }
  if (d.kind === 'occurrence' && (!Number.isInteger(d.index) || d.index < 1)) {
    throw new RangeError('An occurrence index must be a whole number of at least 1')
  }

  // The kind is part of the string: without it, issuer id "2" and occurrence 2
  // would produce the same key for different rows.
  const discriminator = d.kind === 'issuer_id' ? `issuer_id:${d.id}` : `occurrence:${d.index}`

  return [
    `v${DEDUPE_HASH_VERSION}`,
    input.accountId,
    input.postedOn,
    // Sign is part of identity: a $40 charge and a $40 refund are not the same row.
    String(input.amountCents),
    input.merchantRaw,
    discriminator,
  ].join(SEP)
}

/**
 * SHA-256 of the canonical string, lowercase hex.
 *
 * Web Crypto rather than `node:crypto`, because this runs in the browser when
 * the user drops a CSV in, and in an Edge Function when it arrives server-side.
 * Async is the cost of working in both.
 */
export async function computeDedupeHash(input: DedupeInput): Promise<string> {
  const bytes = new TextEncoder().encode(dedupeCanonicalString(input))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Assign occurrence indices across one batch, in the order rows appear.
 *
 * Counting is per identical tuple, not per batch, which is what makes the index
 * stable across overlapping imports: a January row keeps index 1 whether it
 * arrives in a January statement or a January-to-February one, because the
 * February rows differ by date and never share its tuple.
 *
 * Rows carrying an issuer id keep it and are not counted — their identity is
 * already exact, and mixing the two schemes would renumber them.
 */
export function assignDiscriminators<T>(
  rows: readonly T[],
  tupleOf: (row: T) => string,
  issuerIdOf?: (row: T) => string | undefined,
): readonly OccurrenceDiscriminator[] {
  const seen = new Map<string, number>()

  return rows.map((row) => {
    // An empty id is absent, not an identity: a column the issuer left blank
    // would otherwise make every such row share one key.
    const issuerId = issuerIdOf?.(row)
    if (issuerId !== undefined && issuerId.length > 0) {
      return { kind: 'issuer_id', id: issuerId }
    }
    const tuple = tupleOf(row)
    const previous = seen.get(tuple)
    const next = previous === undefined ? 1 : previous + 1
    seen.set(tuple, next)
    return { kind: 'occurrence', index: next }
  })
}
