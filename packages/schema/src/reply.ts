/**
 * A model's reply as it arrives: JSON text, or the object a cache stored.
 * Not re-exported from the index: each parser's own shape says what is kept.
 */
export function replyValue(raw: unknown): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  if (typeof raw !== 'string') return { ok: true, value: raw }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false }
  }
}
