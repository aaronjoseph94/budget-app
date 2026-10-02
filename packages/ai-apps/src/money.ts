/**
 * Money and names as the AI apps server hands them out (PLAN §2.4).
 *
 * Money out is `{ cents, display }`: the integer, and the app's one display
 * helper's words for it, so an AI quotes exactly what the screen shows.
 *
 * Names out (shops, categories, goals, debts) came from statements or the
 * owner, and anyone can name a shop. They lose every control, zero-width
 * and direction-override character, so a name can neither hide text nor
 * reverse how it reads; shop names lose every run of six or more digits,
 * since statements carry card, phone and reference numbers; then each is
 * cut to 80 characters. They are still data, never instructions.
 */
import { formatCents } from '@budget/money-primitives'

export type Money = { readonly cents: number; readonly display: string }

export function money(cents: number): Money {
  return { cents, display: formatCents(cents) }
}

/** The longest name handed out, in characters. */
export const NAME_LIMIT = 80

// C0, DEL and C1; zero-width and direction marks (U+200B–U+200F); line and
// paragraph separators and the embeddings and overrides (U+2028–U+202E);
// the word joiner, invisible operators and isolates (U+2060–U+2069); the BOM.
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

// A character from spreading a string always has a code point; one without
// is refused as hidden rather than read as U+0000.
const visible = (name: string) =>
  [...name].filter((ch) => {
    const code = ch.codePointAt(0)
    return code !== undefined && !hidden(code)
  })

/** A category, goal or debt name, as an AI app is given it. */
export function cleanName(name: string): string {
  return visible(name).slice(0, NAME_LIMIT).join('')
}

/** A shop's name, as an AI app is given it: cleaned, and long numbers masked. */
export function cleanShop(name: string): string {
  const masked = visible(name)
    .join('')
    .replace(/[0-9]{6,}/g, (run) => '*'.repeat(run.length))
  return [...masked].slice(0, NAME_LIMIT).join('')
}

/** Which way a ledger row's money went (D3: money out is below $0). */
export function flowOf(cents: number): 'spent' | 'received' | 'none' {
  return cents < 0 ? 'spent' : cents > 0 ? 'received' : 'none'
}
