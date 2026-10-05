import { describe, expect, it } from 'vitest'
// Whole, as written: vitest.config.ts lets this one stylesheet through.
import css from '../src/index.css?raw'
import app from '../src/App.tsx?raw'

/**
 * Below 768 px the screens' tab bar is fixed over the foot of the page,
 * and a field reached with Tab could sit wholly behind it: Settings'
 * "Weekly budget for Water Bill" at 751-795 under a bar from 735
 * (e2e-setup-02, WCAG 2.2 2.4.11). The page's scroll is padded by the
 * bar, so the browser scrolls a focused control clear of it. jsdom does
 * no layout, so the rule and the bar it answers are what is checked.
 */
describe('a control reached with Tab is never behind the phone tab bar', () => {
  it('pads the page’s scroll by the bar and the home indicator, below 768 px alone', () => {
    expect(css).toMatch(/@media \(width < 48rem\) \{\s*html \{\s*scroll-padding-bottom: calc\(5rem \+ env\(safe-area-inset-bottom\)\);/)
  })

  it('answers the bar that is fixed to the foot and hidden from 768 px', () => {
    expect(app).toMatch(/aria-label="Screens"\s+className="safe-bottom fixed inset-x-0 bottom-0 [^"]*md:hidden/)
  })
})
