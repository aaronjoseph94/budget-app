import { describe, expect, it } from 'vitest'
import css from '../src/index.css?raw'

/** Every class the stylesheet animates, by its `animation:` shorthand. */
function animated(): string[] {
  const found = [...css.matchAll(/\.([a-z][a-z0-9-]*)\s*\{[^}]*\banimation:\s*[a-z]/g)].map((m) => m[1] ?? '')
  return [...new Set(found)]
}
/** The classes a `prefers-reduced-motion: reduce` block turns off. */
function stilled(): Set<string> {
  const out = new Set<string>()
  for (const block of css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)) {
    if (!/animation:\s*none/.test(block[1] ?? '')) continue
    for (const m of (block[1] ?? '').matchAll(/\.([a-z][a-z0-9-]*)/g)) out.add(m[1] ?? '')
  }
  return out
}

describe('Motion in the stylesheet (after transitions.dev: tokens, reduced motion, compositor-only)', () => {
  // Reduced motion turns every animation off; only the row scroll's edge
  // fade, tied to the row's own scroll and moving nothing, is left as is.
  it('stills every animation for someone who asked for reduced motion', () => {
    const missing = animated().filter((c) => c !== 'edge-fade' && !stilled().has(c))
    expect(missing).toEqual([])
    expect(animated()).toEqual(expect.arrayContaining(['sheet-in', 'backdrop-in', 'notice-in', 'figure-change']))
  })

  // Only transform, opacity and filter move: nothing that lays the page out again.
  it('animates only transform, opacity and filter, at the shared durations', () => {
    for (const name of ['sheet-in', 'notice-in', 'figure-change', 'backdrop-in']) {
      const frames = css.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
      expect(frames, name).not.toBe('')
      const props = [...frames.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1])
      expect(props.filter((p) => !['opacity', 'transform', 'filter'].includes(p ?? '')), name).toEqual([])
    }
    expect(css).toMatch(/--motion-quick:\s*160ms/)
    expect(css).toMatch(/--motion-base:\s*220ms/)
  })

})
