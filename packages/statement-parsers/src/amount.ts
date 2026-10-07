/**
 * Statement text to `Cents`, without ever forming a float.
 *
 * `parseFloat` is banned in this package by eslint, and for a concrete reason
 * rather than a stylistic one: `parseFloat('0.29') * 100` is 28.999999999999996,
 * and rounding that back is a cent that appears or vanishes depending on the
 * value. Every amount here is assembled from its digits as an integer.
 *
 * NOTHING IS GUESSED. A statement that cannot be read produces a rejection code
 * for the review queue, never a zero and never a best guess. CONSTRAINTS.md
 * forbids a silent numeric fallback on a money path because $0.00 is a real
 * amount: a row that quietly became zero is indistinguishable from a refund.
 *
 * Failures carry a code, never the text that failed. CLAUDE.md permits logs to
 * hold ids, enum codes and counts only, and a rejection reason is a thing that
 * gets logged.
 */
import { type Cents, cents } from '@budget/money-primitives'
import type { RejectionReason } from '@budget/schema'

export type ParseOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: RejectionReason }

export interface AmountFormat {
  /**
   * Which character separates the whole part from the fraction.
   *
   * Explicit, never sniffed. "1.234" is one thousand two hundred and thirty
   * four in Berlin and one-point-two-three-four in Boston, and no amount of
   * cleverness can tell which from the string alone. Guessing here is how an
   * import is wrong by a factor of a thousand.
   */
  readonly decimalSeparator: '.' | ','
  /** Accounting exports write a negative as (1,234.56). */
  readonly parenthesesMeanNegative: boolean
}

export const US_AMOUNT_FORMAT: AmountFormat = {
  decimalSeparator: '.',
  parenthesesMeanNegative: true,
}

/**
 * A currency sign or a space: no numeric meaning at either edge of the
 * number, or between a sign and it ("$ 12.34", "-$1,234.56", "12.34 €").
 * Inside the number, a currency sign is refused, and a space is read as
 * the grouping separator and held to the same rule ("1 234,56" is a
 * statement's grouping; "12 34" is not). Dropping both anywhere read
 * "12 34" as $1,234.00 and "4$50" as $450.00 (testing fuzz-04).
 */
const EDGE = /[$£€¥\s]/
const SIGN_INSIDE = /[$£€¥]/
const SPACE_INSIDE = /\s/

/** The text without currency signs and spaces at either end. */
function edgesOff(text: string): string {
  let from = 0
  let to = text.length
  while (from < to && EDGE.test(text.charAt(from))) from += 1
  while (to > from && EDGE.test(text.charAt(to - 1))) to -= 1
  return text.slice(from, to)
}

export function parseAmountToCents(raw: string, format: AmountFormat): ParseOutcome<Cents> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'missing_amount' }

  let body = trimmed
  let negative = false

  // Parentheses first: "($12.34)" is negative, and the symbol sits inside them.
  if (format.parenthesesMeanNegative && body.startsWith('(') && body.endsWith(')')) {
    negative = true
    body = body.slice(1, -1)
  }

  body = edgesOff(body)

  if (body.startsWith('-')) {
    // "-(12.34)" is not a convention anywhere; two negatives means malformed.
    if (negative) return { ok: false, reason: 'unparseable_amount' }
    negative = true
    body = edgesOff(body.slice(1))
  } else if (body.startsWith('+')) {
    body = edgesOff(body.slice(1))
  }

  // The grouping separator is whichever one is not the decimal separator.
  const grouping = format.decimalSeparator === '.' ? ',' : '.'

  if (SIGN_INSIDE.test(body)) return { ok: false, reason: 'unparseable_amount' }
  if (SPACE_INSIDE.test(body)) {
    // Spaces or the separator as grouping, never both in one number.
    if (body.includes(grouping)) return { ok: false, reason: 'unparseable_amount' }
    body = body.split(/\s/).join(grouping)
  }

  // Split on the decimal separator BEFORE touching grouping, so the grouping
  // that remains can be checked for position rather than blindly deleted.
  const parts = body.split(format.decimalSeparator)
  if (parts.length > 2) return { ok: false, reason: 'unparseable_amount' }

  const [groupedWhole = '', fraction = ''] = parts

  // A separator in the wrong place means the declared format is not this
  // statement's format. Stripping it regardless is how "12,34" from a European
  // export becomes $1,234.00 under US_AMOUNT_FORMAT — a ledger 100x wrong with
  // every row reporting ok. The module promises nothing is guessed; this is
  // where that promise is kept, by rejecting into the review queue instead.
  if (!hasWellFormedGrouping(groupedWhole, grouping)) {
    return { ok: false, reason: 'unparseable_amount' }
  }

  const whole = groupedWhole.split(grouping).join('')
  if (whole.length === 0 || !isDigits(whole)) return { ok: false, reason: 'unparseable_amount' }

  // More than two decimals cannot be paid, received, or reconciled against a
  // bank. Rejecting sends it to the queue; rounding would invent a number.
  if (parts.length === 2 && (fraction.length === 0 || fraction.length > 2 || !isDigits(fraction))) {
    return { ok: false, reason: 'unparseable_amount' }
  }

  const minor = fraction.padEnd(2, '0')
  const magnitude = Number(whole) * 100 + Number(minor)

  try {
    return { ok: true, value: cents(negate(magnitude, negative)) }
  } catch {
    // Swallows the RangeError deliberately: its message names the amount.
    return { ok: false, reason: 'unparseable_amount' }
  }
}

/**
 * Whether the whole part groups its digits legally, or does not group at all.
 *
 * Legal is `1234`, `1`, `1,234`, `1,234,567`. Illegal is `12,34` (a group of
 * two), `1,2,3` and `1234,567` (four digits before the first separator) —
 * each of which is the signature of a statement whose format was misdeclared.
 */
function hasWellFormedGrouping(wholePart: string, grouping: string): boolean {
  if (!wholePart.includes(grouping)) return true

  const groups = wholePart.split(grouping)
  const [lead] = groups
  if (lead === undefined || lead.length < 1 || lead.length > 3 || !isDigits(lead)) return false

  return groups.slice(1).every((group) => group.length === 3 && isDigits(group))
}

/**
 * Negation that cannot produce `-0`.
 *
 * `-0 === 0` is true, so this changes no arithmetic, but `Object.is(-0, 0)` is
 * false and `JSON.stringify` of a `-0` inside an array yields `0` while the
 * value itself compares unequal in a test or a cache key. A zero amount is
 * zero; there is no negative version of it.
 */
function negate(magnitude: number, negative: boolean): number {
  if (magnitude === 0) return 0
  return negative ? -magnitude : magnitude
}

function isDigits(value: string): boolean {
  if (value.length === 0) return false
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x30 || code > 0x39) return false
  }
  return true
}

/**
 * How a statement expresses direction, chosen by the user when they map columns.
 *
 * The app stores outflows negative (docs/divergences.md D3), but exports
 * disagree wildly about their own convention, and the difference between them
 * is every number in the app having the wrong sign.
 */
export type SignConvention =
  /** The column is already signed; a purchase is negative. */
  | { readonly kind: 'signed' }
  /** One column, positive numbers, where a purchase is written as a positive. */
  | { readonly kind: 'debit_positive' }

/** Apply the statement's convention to produce the app's signed value. */
export function applySignConvention(amount: Cents, convention: SignConvention): Cents {
  if (convention.kind === 'signed') return amount
  // A positive debit is an outflow; a negative one is the refund of a debit.
  // `negate` rather than `-amount`, so a zero does not become `-0`.
  return cents(negate(amount, true))
}

/**
 * A dollar amount a person typed, as cents, or null if it is not one.
 *
 * "12.5", "12.50", "$1,234.00" and "1234" mean here exactly what they mean
 * in a CSV: the missing cents are padded, then the statement parser reads
 * it. The app's money fields and the AI apps server both read typed
 * amounts through this, so the same words mean the same amount in both.
 */
export function parseTypedAmount(text: string): Cents | null {
  const read = readTypedAmount(text)
  return read.ok ? read.value : null
}

/**
 * The most a person may type in a money field, either way: $999,999,999.99.
 * Far past any household figure, and far enough inside whole-number range
 * that the engine can add a year of every budget without refusing. Taken
 * unbounded, 90071992547409.91 was saved, then every Month, Week and Year
 * that added it up failed to draw, and hid the editor that could undo it
 * (e2e-plan-01).
 */
export const MAX_TYPED_CENTS: Cents = cents(99_999_999_999)

/** A typed amount, or why it is not one: not an amount at all, or past MAX_TYPED_CENTS. */
export type TypedAmount =
  | { readonly ok: true; readonly value: Cents }
  | { readonly ok: false; readonly reason: 'not_an_amount' | 'too_large' }

/** parseTypedAmount, saying which way the text failed, so a field can say "too large". */
export function readTypedAmount(text: string): TypedAmount {
  const trimmed = text.trim().replace(/^\$/, '')
  if (trimmed.length === 0) return { ok: false, reason: 'not_an_amount' }
  const withCents = /\.\d{2}$/.test(trimmed) ? trimmed : /\.\d$/.test(trimmed) ? `${trimmed}0` : `${trimmed}.00`
  const parsed = parseAmountToCents(withCents, US_AMOUNT_FORMAT)
  if (!parsed.ok) return { ok: false, reason: 'not_an_amount' }
  if (parsed.value > MAX_TYPED_CENTS || parsed.value < -MAX_TYPED_CENTS) return { ok: false, reason: 'too_large' }
  return { ok: true, value: parsed.value }
}
