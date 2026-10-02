/**
 * A statement descriptor, tidied for display and for matching a rule.
 *
 * NOT an input to the dedupe hash. That one is computed over the raw string
 * precisely so this can keep being tuned: every rule below is a heuristic that
 * will be revised as real statements arrive, and if the hash depended on it,
 * improving merchant display would silently re-key the entire ledger. See
 * dedupe.ts.
 *
 * DELIBERATELY UNDER-NORMALIZED. The two mistakes are not equal:
 *
 *   - Too little, and `SQ *BLUE BOTTLE 4155551234` and `SQ *BLUE BOTTLE` are
 *     two merchants. The user categorises one extra row, once, and a rule
 *     covers it thereafter. Visible and cheap.
 *   - Too much, and two different merchants collapse into one name. That name
 *     is what `merchant_rules` matches on, so a rule taught for one silently
 *     auto-approves the other — the only path that skips human review.
 *
 * So every rule here strips something whose absence cannot change WHICH
 * business a descriptor refers to: a payment processor's own prefix, a store
 * or order number, a phone number. Nothing guesses.
 */

/**
 * Prefixes payment processors prepend to the real merchant's name.
 *
 * An explicit list, not a pattern. A pattern like "anything before an
 * asterisk" would eat the merchant in `A&W *DOWNTOWN`, and the whole point is
 * that removing something must not change who was paid.
 */
const PROCESSOR_PREFIXES: readonly string[] = [
  'SQ *',
  'SQ*',
  'TST*',
  'TST *',
  'PAYPAL *',
  'PAYPAL*',
  'PP*',
  'PP *',
  'SP *',
  'SP*',
  'IN *',
  // Listed twice as 'IN *' until 2026-10-01, so 'IN*SHOP' and 'IN *SHOP'
  // were two shops; 0030 tidies the names stored before (architecture-a-10).
  'IN*',
  'WWW.',
  'WWW ',
  'POS PURCHASE ',
  'POS DEBIT ',
  'DEBIT CARD PURCHASE ',
  'VISA PURCHASE ',
  'CARD PURCHASE ',
]

/** A trailing store, order or reference number: four or more digits. */
const TRAILING_DIGITS = /[\s#*-]+\d{4,}$/
/** A trailing phone number, with or without punctuation. */
const TRAILING_PHONE = /[\s#*-]+(?:\+?\d[\d\s().-]{8,})$/
/** Punctuation left stranded once a number is removed. */
const TRAILING_PUNCTUATION = /[\s#*,.\-–—/\\|]+$/
const LEADING_PUNCTUATION = /^[\s#*,.\-–—/\\|]+/

/**
 * Normalize a descriptor.
 *
 * Idempotent: normalizing an already-normalized string returns it unchanged,
 * which matters because the result is stored and may be normalized again by a
 * later version without drifting.
 *
 * Returns the input trimmed and uppercased if every rule would empty it — a
 * merchant that normalizes to nothing is worse than one that normalizes badly,
 * because `merchant_rules` would then match every such row.
 */
export function normalizeMerchant(raw: string): string {
  const upper = raw.trim().toUpperCase()
  if (upper.length === 0) return ''

  let working = upper
  for (const prefix of PROCESSOR_PREFIXES) {
    if (working.startsWith(prefix)) {
      working = working.slice(prefix.length)
      break // One prefix only. Stacking them is how a merchant name gets eaten.
    }
  }

  // Applied once each, not in a loop: repeating would strip `STORE 1234 5678`
  // down past the point where it still names a business.
  working = working.replace(TRAILING_PHONE, '')
  working = working.replace(TRAILING_DIGITS, '')
  working = working.replace(TRAILING_PUNCTUATION, '')
  working = working.replace(LEADING_PUNCTUATION, '')
  working = working.replace(/\s+/gu, ' ').trim()

  return working.length === 0 ? upper : working
}

/**
 * Whether two descriptors name the same merchant for rule-matching purposes.
 *
 * Equality on the normalized form, never similarity. CONSTRAINTS.md permits a
 * candidate to auto-approve only on an exact `merchant_rules` match — a
 * deterministic lookup, not a judgment — and a similarity score is a judgment
 * however good it is.
 */
export function sameMerchant(a: string, b: string): boolean {
  return normalizeMerchant(a) === normalizeMerchant(b)
}

/** A word counts as a real name once it holds four or more letters; "THE" or "A&W" alone says nothing. */
const LONG_WORD = /(?:\p{L}.*){4}/u

/**
 * The learned shop a descriptor most looks like, for a hint on Review when
 * no AI is on (plan A21; ADR 0008): the one whose tidied name shares the
 * most leading words with this one's, at least one of them four letters or
 * more. A tie is no hint: guessing between two shops is a judgment.
 *
 * A HINT ONLY. The screen picks its category and the owner still taps
 * Approve; nothing stores or approves by it. `sameMerchant`, equality,
 * stays the only match that files a row by itself (CONSTRAINTS.md, the
 * approval invariant).
 *
 * Returns the learned name as it was given, so the caller can look up its
 * rule, or null.
 */
export function similarMerchant(name: string, learned: readonly string[]): string | null {
  const words = normalizeMerchant(name).split(' ')
  let best: string | null = null
  let bestShared = 0
  let tied = false
  for (const shop of learned) {
    const theirs = normalizeMerchant(shop).split(' ')
    let shared = 0
    while (shared < words.length && shared < theirs.length && words[shared] === theirs[shared]) shared += 1
    if (shared === 0 || !words.slice(0, shared).some((w) => LONG_WORD.test(w))) continue
    if (shared > bestShared) {
      best = shop
      bestShared = shared
      tied = false
    } else if (shared === bestShared) {
      tied = true
    }
  }
  return tied ? null : best
}
