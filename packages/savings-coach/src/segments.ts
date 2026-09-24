/**
 * A sentence with blanks, split into text and figures (ADR 0005 §3, §5).
 *
 * The Coach's words, the app's own or a model's, never hold a figure: they
 * hold blanks such as `{{A.change}}`, and the app draws the engine's figure
 * for each as it renders. This is the only place a sentence is read, and it
 * never turns text into markup: `<img …>` in a sentence is a text segment,
 * which React draws as the characters it is.
 *
 * A blank must name a fact the sentence was offered and a slot that fact
 * has. Anything else is refused whole, never repaired: a sentence missing a
 * figure it meant to show would say something untrue.
 */

/** Plain text, or a blank to fill with a fact's figure. */
export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'blank'; readonly letter: string; readonly slot: string }

export interface RenderSegmentsInput {
  readonly text: string
  /** Each fact the sentence may name, by letter, with the slots it has. */
  readonly slots: Readonly<Record<string, readonly string[]>>
}

export type RenderSegmentsOutput =
  | { readonly ok: true; readonly segments: readonly Segment[] }
  | { readonly ok: false; readonly reason: 'stray_brace' | 'unknown_fact' | 'unknown_slot' }

/** Two braces, one or two capitals, a dot, a slot name, two braces: no digit can be in one. */
const BLANK = /\{\{([A-Z]{1,2})\.([a-z_]{1,24})\}\}/g

export function renderSegments(input: RenderSegmentsInput): RenderSegmentsOutput {
  const segments: Segment[] = []
  let at = 0
  for (const match of input.text.matchAll(BLANK)) {
    // Both groups always match when the whole does.
    const whole = match[0]
    const letter = match[1]!
    const slot = match[2]!
    const offered = Object.hasOwn(input.slots, letter) ? input.slots[letter] : undefined
    if (offered === undefined) return { ok: false, reason: 'unknown_fact' }
    if (!offered.includes(slot)) return { ok: false, reason: 'unknown_slot' }
    push(segments, input.text.slice(at, match.index))
    segments.push({ kind: 'blank', letter, slot })
    at = match.index + whole.length
  }
  push(segments, input.text.slice(at))
  // A brace left outside a well-formed blank is a blank written wrong.
  const text = segments.map((s) => (s.kind === 'text' ? s.text : '')).join('')
  if (text.includes('{') || text.includes('}')) return { ok: false, reason: 'stray_brace' }
  return { ok: true, segments }
}

function push(segments: Segment[], text: string): void {
  if (text !== '') segments.push({ kind: 'text', text })
}
