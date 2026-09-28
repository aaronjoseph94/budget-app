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

/** `fg` laid over `bg` at `alpha`, as `bg-destructive/5` draws it on a card. */
function over(fg: string, bg: string, alpha: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16)
  return `#${[1, 3, 5].map((i) => Math.round(alpha * channel(fg, i) + (1 - alpha) * channel(bg, i)).toString(16).padStart(2, '0')).join('')}`
}

// FE-7-NEW-2: an error Alert is red words on a 5% red tint, and #e7000b
// read at 4.26:1 there, under the 4.5 that text needs.
describe.each([
  ['light', light],
  ['dark', dark],
])('%s scheme, error text', (_, scheme) => {
  it.each(['card', 'background', 'muted'])('reads at 4.5:1 or more on --%s and on its own tint over it', (surface) => {
    const red = pick(scheme, 'destructive')
    const ground = pick(scheme, surface)
    expect(ratio(red, ground)).toBeGreaterThanOrEqual(4.5)
    // On muted the tint is not used, and the dark red reads at 4.34 there.
    if (surface !== 'muted') expect(ratio(red, over(red, ground, 0.05))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('the focus ring', () => {
  it('is drawn at full strength, not faded to half', async () => {
    const sources = import.meta.glob('../src/**/*.tsx', { query: '?raw', import: 'default', eager: true })
    const faded = Object.entries(sources).filter(([, text]) => /ring-ring\/\d+/.test(String(text))).map(([file]) => file)
    expect(faded).toEqual([])
  })
})
