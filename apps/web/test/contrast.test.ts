import { describe, expect, it } from 'vitest'
// Whole, as written: vitest.config.ts lets this one stylesheet through.
import css from '../src/index.css?raw'

/**
 * The colour tokens a control's edge is drawn in, checked against the
 * surfaces it sits on, in both schemes. The checklist's bar for a control is
 * 3:1 (WCAG 1.4.11). Read from index.css itself, so a token changed there
 * is measured here.
 */
function tokens(block: string): Map<string, string> {
  return new Map([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1] ?? '', (m[2] ?? '').toLowerCase()]))
}

const light = tokens(css.slice(css.indexOf(':root'), css.indexOf('@media (prefers-color-scheme: dark)')))
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)')
const dark = tokens(css.slice(darkStart, css.indexOf('\n}\n', darkStart)))

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

function pick(scheme: Map<string, string>, name: string): string {
  const value = scheme.get(name)
  if (value === undefined) throw new Error(`--${name} is not a hex colour in this scheme`)
  return value
}

describe.each([
  ['light', light],
  ['dark', dark],
])('%s scheme', (_, scheme) => {
  // FE-4: the ring was #9abdb7 at half opacity, 1.39:1 on a card.
  it.each(['card', 'background', 'muted'])('draws the focus ring at 3:1 or more on --%s', (surface) => {
    expect(ratio(pick(scheme, 'ring'), pick(scheme, surface))).toBeGreaterThanOrEqual(3)
  })
  // FE-5: a field's fill is the card it sits on, so its border is its only
  // edge; at oklch(0.922) it was 1.25:1.
  it.each(['card', 'background', 'muted'])('draws a field border at 3:1 or more on --%s', (surface) => {
    expect(ratio(pick(scheme, 'input'), pick(scheme, surface))).toBeGreaterThanOrEqual(3)
  })
})

describe('the focus ring', () => {
  it('is drawn at full strength, not faded to half', async () => {
    const sources = import.meta.glob('../src/**/*.tsx', { query: '?raw', import: 'default', eager: true })
    const faded = Object.entries(sources).filter(([, text]) => /ring-ring\/\d+/.test(String(text))).map(([file]) => file)
    expect(faded).toEqual([])
  })
})
