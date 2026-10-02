/**
 * The one place money becomes a string.
 *
 * CLAUDE.md invariant 2 allows exactly one display helper, and this is it:
 * the app re-exports it from `apps/web/src/format.ts`, and the AI apps
 * server gives every figure's `display` through it (ADR 0012). Everywhere
 * else money is integer `Cents`.
 *
 * It formats from the integer directly rather than dividing by 100 first: a
 * division would hand the formatter a float, and the whole point of storing
 * minor units is that no float ever touches an amount.
 */
const GROUPED = new Intl.NumberFormat('en-US')

export function formatCents(amountCents: number): string {
  // A float or NaN printed as a plausible amount ("$0.12.5", "$NaN.NaN")
  // would hide the bug that made it; the message names no value, per the
  // log rule (architecture-a-09).
  if (!Number.isSafeInteger(amountCents)) throw new RangeError('formatCents takes whole cents')
  const negative = amountCents < 0
  const magnitude = Math.abs(amountCents)
  const whole = Math.floor(magnitude / 100)
  const fraction = magnitude % 100
  const body = `$${GROUPED.format(whole)}.${String(fraction).padStart(2, '0')}`
  return negative ? `-${body}` : body
}
